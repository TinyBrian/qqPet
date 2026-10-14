// Touch bridge derived from TrollSpeed a609be260c8261ead36509c3bc4ded8479da9c40.
// Copyright (c) 2023 Lessica. MIT; see vendor/TrollSpeed/LICENSE and ORIGIN.md.
#import "QPEventBridge.h"
#import "UIApplication+Private.h"
#import "UIEvent+Private.h"
#import "UIEventDispatcher.h"
#import "UIEventFetcher.h"
#import "UITouch-KIFAdditions.h"
#import "BackboardServices.h"
#import "AXEventRepresentation.h"
#import <objc/runtime.h>
#import <sys/utsname.h>
#import <dlfcn.h>
#import <stdatomic.h>
#import "pac_helper.h"
#import "QPPrivate.h"

static __weak UIWindow *sWindow;
static CGPoint sGlobalPoint;
static BOOL sReady;
static NSMutableDictionary<NSNumber *, UITouch *> *sTouches;
static NSMutableSet<NSNumber *> *sCapturedPaths;
static CFRunLoopSourceRef sTouchSource;
static NSMutableArray<NSDictionary *> *sTouchBatches;
static NSMutableArray<UITouch *> *sResetTouches;
static NSDictionary<NSNumber *, UITouch *> *sDeliveredTouches;
static _Atomic(uint64_t) sTouchGeneration;
static BOOL sSendingTouches;
static UIEvent *sSyntheticEvent;
static void (^sOutsideTouchHandler)(void);
static CFTypeRef sMonitor;
static void (*sUnscheduleMonitor)(CFTypeRef,CFRunLoopRef,CFStringRef);
static uint32_t (*sEventType)(IOHIDEventRef);
static CFIndex (*sEventInteger)(IOHIDEventRef,uint32_t);
static double (*sEventFloat)(IOHIDEventRef,uint32_t);
static CFArrayRef (*sEventChildren)(IOHIDEventRef);

static void QPSignalTouchSource(void) {
    if (!sTouchSource) return;
    CFRunLoopSourceSignal(sTouchSource);
    CFRunLoopWakeUp(CFRunLoopGetMain());
}

static void QPSendTouches(NSArray<UITouch *> *touches) {
    sSendingTouches = YES;
    UIEvent *event = [UIApplication.sharedApplication _touchesEvent];
    // Standalone hosts may never receive the raw UIKit event that normally
    // creates this object. Sending nil silently drops all touch delivery.
    if (!event) {
        if (!sSyntheticEvent) {
            Class eventClass=objc_getClass("UITouchesEvent");
            UIEvent *allocated=[eventClass alloc];
            if ([allocated respondsToSelector:@selector(_init)]) sSyntheticEvent=[allocated _init];
        }
        event=sSyntheticEvent;
    }
    if (![event respondsToSelector:@selector(_clearTouches)] || ![event respondsToSelector:@selector(_addTouch:forDelayedDelivery:)]) {
        sSendingTouches=NO;
        QPEventBridgeDiagnostic(@"UIKit touch event construction unavailable.");
        return;
    }
    [event _clearTouches];
    IOHIDEventRef hidEvent = kif_IOHIDEventWithTouches(touches);
    if (hidEvent) {
        if ([event respondsToSelector:@selector(_setHIDEvent:)]) [event _setHIDEvent:hidEvent];
        CFRelease(hidEvent);
    }
    for (UITouch *touch in touches) [event _addTouch:touch forDelayedDelivery:NO];
    [UIApplication.sharedApplication sendEvent:event];
    sSendingTouches = NO;
}

CGPoint QPLatestGlobalTouchPoint(void) { return sGlobalPoint; }
BOOL QPGlobalEventBridgeReady(void) { return sReady; }
void QPSetOutsideTouchHandler(void (^handler)(void)) {
    sOutsideTouchHandler = [handler copy];
    if (!handler && sMonitor) { sUnscheduleMonitor(sMonitor,CFRunLoopGetMain(),kCFRunLoopCommonModes); CFRelease(sMonitor); sMonitor=NULL; }
}

// Older UIKit's dispatcher entry point is not exposed as an Objective-C method.
// This bounded, read-only fallback follows TrollSpeed HUDMainApplication.mm at
// the pinned revision. Match its call-site and target instruction signatures;
// require both to belong to the same loaded image before making the call.
static BOOL QPInstallDispatcherSources(UIEventDispatcher *dispatcher, UIApplication *app) {
    SEL selector = @selector(_installEventRunLoopSources:);
    if ([dispatcher respondsToSelector:selector]) {
        [dispatcher _installEventRunLoopSources:CFRunLoopGetMain()];
        return YES;
    }
    IMP runIMP = class_getMethodImplementation(app.class, @selector(_run));
    if (!runIMP) return NO;
    uint32_t *instructions = (uint32_t *)make_sym_readable((void *)runIMP);
    Dl_info runInfo = {};
    if (!dladdr(instructions, &runInfo)) return NO;
    for (NSUInteger i = 0; i + 2 < 0x140; i++) {
        if (instructions[i] != 0xaa0003e2 || (instructions[i+1] & 0xff000000) != 0xaa000000) continue;
        uint32_t branch = instructions[i+2];
        if ((branch & 0xfc000000) != 0x94000000) continue;
        int32_t offset = branch & 0x03ffffff;
        if (offset & 0x02000000) offset |= (int32_t)0xfc000000;
        uintptr_t target = (uintptr_t)&instructions[i+2] + (int64_t)offset * 4;
        Dl_info targetInfo = {};
        if (!dladdr((void *)target, &targetInfo) || targetInfo.dli_fbase != runInfo.dli_fbase) continue;
        uint32_t firstInstruction = *(uint32_t *)make_sym_readable((void *)target);
        if ((firstInstruction & 0xff000000) != 0xb4000000) continue;
        __auto_type install = (void (*)(id, SEL, CFRunLoopRef))make_sym_callable((void *)target);
        install(dispatcher, selector, CFRunLoopGetMain());
        QPEventBridgeDiagnostic(@"Installed old UIKit dispatcher run-loop entry point using the pinned TrollSpeed fallback.");
        return YES;
    }
    return NO;
}
static void QPResetTouchesOnMain(uint64_t generation) {
    if (generation != atomic_load_explicit(&sTouchGeneration, memory_order_relaxed)) return;
    [sTouchBatches removeAllObjects];
    for (UITouch *touch in sTouches.allValues) {
        if (touch.phase != UITouchPhaseEnded && touch.phase != UITouchPhaseCancelled && ![sResetTouches containsObject:touch])
            [sResetTouches addObject:touch];
    }
    [sTouches removeAllObjects];
    [sCapturedPaths removeAllObjects];
    sDeliveredTouches = nil;
    // A reset can be requested by a view while sendEvent: is on the stack.
    // Deliver its cancellation through the source, without reusing that event
    // recursively, and retain the old target views until cancellation is sent.
    if (sResetTouches.count) QPSignalTouchSource();
}

void QPResetCapturedTouches(void) {
    uint64_t generation = atomic_fetch_add_explicit(&sTouchGeneration, 1, memory_order_relaxed) + 1;
    if (NSThread.isMainThread) QPResetTouchesOnMain(generation);
    else dispatch_async(dispatch_get_main_queue(), ^{ QPResetTouchesOnMain(generation); });
}

@implementation QPHUDApplication
- (instancetype)init {
    if ((self = [super init])) {
        @try {
            UIEventDispatcher *dispatcher = [self valueForKey:@"eventDispatcher"];
            if (!dispatcher || !QPInstallDispatcherSources(dispatcher, self)) {
                QPEventBridgeDiagnostic(@"Private UIEventDispatcher run-loop entry point unavailable.");
                return self;
            }
            Class fetcherClass = objc_getClass("UIEventFetcher");
            if (!fetcherClass) {
                QPEventBridgeDiagnostic(@"Private UIEventFetcher class unavailable.");
                return self;
            }
            UIEventFetcher *fetcher = [[fetcherClass alloc] init];
            [dispatcher setValue:fetcher forKey:@"eventFetcher"];
            if ([fetcher respondsToSelector:@selector(setEventFetcherSink:)])
                [fetcher setEventFetcherSink:dispatcher];
            else
                [fetcher setValue:dispatcher forKey:@"eventFetcherSink"];
            [self setValue:fetcher forKey:@"eventFetcher"];
            sReady = YES;
        } @catch (NSException *exception) {
            QPEventBridgeDiagnostic([@"Event setup exception: " stringByAppendingString:exception.reason ?: exception.name]);
        }
    }
    return self;
}
@end

static BOOL QPStageTouch(NSNumber *identity, CGPoint global, UITouchPhase phase) {
    UIWindow *window = sWindow;
    if (!window || window.hidden || !window.userInteractionEnabled) return NO;
    sGlobalPoint = global;
    CGPoint local = [window convertPoint:global fromCoordinateSpace:UIScreen.mainScreen.fixedCoordinateSpace];
    UITouch *touch = sTouches[identity];
    if (!touch) {
        if (phase != UITouchPhaseBegan) return NO;
        if (!CGRectContainsPoint(window.bounds, local)) return NO;
        UIView *view = [window hitTest:local withEvent:nil];
        if (!view) return NO;
        touch = [[UITouch alloc] initAtPoint:local inWindow:window onView:view];
        kif_setTouchPathIdentity(touch, identity.unsignedIntValue);
        sTouches[identity] = touch;
        [sCapturedPaths addObject:identity];
    } else {
        [touch setLocationInWindow:local];
    }
    [touch setPhaseAndUpdateTimestamp:phase];
    [touch kif_setHidEvent];
    return YES;
}

static void QPPrepareNextTouchBatch(void) {
    // Like the pinned fetcher, keep the delivered phase and strong references
    // intact until the next input batch, rather than changing them on return
    // from sendEvent:. Unchanged fingers then appear as stationary together.
    for (NSNumber *identity in sDeliveredTouches) {
        UITouch *touch = sDeliveredTouches[identity];
        if (sTouches[identity] != touch) continue;
        if (touch.phase == UITouchPhaseEnded || touch.phase == UITouchPhaseCancelled) {
            [sTouches removeObjectForKey:identity];
            [sCapturedPaths removeObject:identity];
        } else if (touch.phase != UITouchPhaseStationary) {
            [touch setPhaseAndUpdateTimestamp:UITouchPhaseStationary];
            [touch kif_setHidEvent];
        }
    }
    sDeliveredTouches = nil;
}

static void QPTouchSourcePerform(void *info) {
    // A nested run loop must not clear the UIEvent currently being dispatched.
    // The outer invocation signals any remaining work after sendEvent: returns.
    if (sSendingTouches) return;
    if (sResetTouches.count) {
        NSArray<UITouch *> *cancelled = [sResetTouches copy];
        [sResetTouches removeAllObjects];
        for (UITouch *touch in cancelled) {
            [touch setPhaseAndUpdateTimestamp:UITouchPhaseCancelled];
            [touch kif_setHidEvent];
        }
        QPSendTouches(cancelled);
    } else if (sTouchBatches.count) {
        NSDictionary *batch = sTouchBatches.firstObject;
        [sTouchBatches removeObjectAtIndex:0];
        UIWindow *window = sWindow;
        if ([batch[@"generation"] unsignedLongLongValue] == atomic_load_explicit(&sTouchGeneration, memory_order_relaxed) &&
            window && !window.hidden && window.userInteractionEnabled) {
            QPPrepareNextTouchBatch();
            BOOL changed = NO;
            for (NSDictionary *path in batch[@"paths"]) {
                NSNumber *identity = path[@"identity"];
                UITouchPhase phase = UITouchPhaseMoved;
                if ([batch[@"cancel"] boolValue]) phase = UITouchPhaseCancelled;
                else if (path[@"proximity"]) {
                    // AX proximity's touch bit distinguishes contact (3) from
                    // range-only (1) and lift (0). A packet-wide lift can refer
                    // to a different finger, so each available path wins here.
                    BOOL touching = ([path[@"proximity"] unsignedCharValue] & 0x2) != 0;
                    if (!touching) phase = UITouchPhaseEnded;
                    else if (!sTouches[identity] && [batch[@"down"] boolValue]) phase = UITouchPhaseBegan;
                } else {
                    // Older representations expose only packet-wide phases.
                    if ([batch[@"lift"] boolValue] || [batch[@"inRangeLift"] boolValue] || [batch[@"inRange"] boolValue]) phase = UITouchPhaseEnded;
                    else if (!sTouches[identity] && [batch[@"down"] boolValue]) phase = UITouchPhaseBegan;
                }
                if (QPStageTouch(identity, [path[@"location"] CGPointValue], phase)) changed = YES;
            }
            if (changed) {
                sDeliveredTouches = [sTouches copy];
                QPSendTouches(sDeliveredTouches.allValues);
            }
        }
    }
    // CFRunLoopSource signals coalesce. Keep every packet in the FIFO and send
    // only one batch per perform so a queued end cannot replace an unsent begin.
    if (sResetTouches.count || sTouchBatches.count) QPSignalTouchSource();
}

static AXEventRepresentation *QPRepresentation(IOHIDEventRef event) {
    static Class representationClass;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        [[NSBundle bundleWithPath:@"/System/Library/PrivateFrameworks/AccessibilityUtilities.framework"] load];
        representationClass = objc_getClass("AXEventRepresentation");
    });
    if (!representationClass || ![representationClass respondsToSelector:@selector(representationWithHIDEvent:hidStreamIdentifier:)]) return nil;
    return [representationClass representationWithHIDEvent:event hidStreamIdentifier:@"UIApplicationEvents"];
}

static void QPObserveDigitizer(IOHIDEventRef event,NSUInteger depth) {
    if (depth>3 || !event) return;
    CFArrayRef children=sEventChildren(event); CFIndex count=children?CFArrayGetCount(children):0;
    // IOHIDFamily-1446.140.2 IOHIDEventTypes/FieldDefs.h (Darwin 20), also
    // pinned in KIF: digitizer=11, event mask=7, touch=9, X=0, Y=1.
    const uint32_t digitizer=11<<16;
    if (sEventType(event)==11 && !count && sEventInteger(event,digitizer|9) && (sEventInteger(event,digitizer|7)&(1<<1))) {
        double x=sEventFloat(event,digitizer), y=sEventFloat(event,digitizer|1);
        if (!isfinite(x)||!isfinite(y)||x<0||y<0) return;
        CGSize size=UIScreen.mainScreen.fixedCoordinateSpace.bounds.size;
        if (x<=1&&y<=1) { x*=size.width; y*=size.height; }
        else if (sEventInteger(event,2)) { x/=UIScreen.mainScreen.scale; y/=UIScreen.mainScreen.scale; }
        CGPoint local=[sWindow convertPoint:CGPointMake(x,y) fromCoordinateSpace:UIScreen.mainScreen.fixedCoordinateSpace];
        if (![sWindow hitTest:local withEvent:nil]) {
            void (^handler)(void)=[sOutsideTouchHandler copy];
            if (handler) dispatch_async(dispatch_get_main_queue(),handler);
        }
    }
    for (CFIndex i=0;i<MIN(count,64);i++) QPObserveDigitizer((IOHIDEventRef)CFArrayGetValueAtIndex(children,i),depth+1);
}
static void QPMonitorCallback(void *target,void *context,void *service,IOHIDEventRef event) {
    // This is a non-filtering subscription. It never records input or dispatches
    // an event, and reads digitizers only while our own HUD is visible.
    if (!sWindow || sWindow.hidden || !sWindow.userInteractionEnabled || !sOutsideTouchHandler) return;
    QPObserveDigitizer(event,0);
}
static void QPInstallOutsideMonitor(void) {
    if (sMonitor) return;
    dlopen("/System/Library/Frameworks/IOKit.framework/IOKit",RTLD_NOW|RTLD_GLOBAL);
    // C callback/scheduling declarations are the same as ios-mcp IOHIDPrivate.h.
    __auto_type create=(CFTypeRef(*)(CFAllocatorRef))dlsym(RTLD_DEFAULT,"IOHIDEventSystemClientCreate");
    __auto_type subscribe=(void(*)(CFTypeRef,void(*)(void*,void*,void*,IOHIDEventRef),void*,void*))dlsym(RTLD_DEFAULT,"IOHIDEventSystemClientRegisterEventCallback");
    __auto_type schedule=(void(*)(CFTypeRef,CFRunLoopRef,CFStringRef))dlsym(RTLD_DEFAULT,"IOHIDEventSystemClientScheduleWithRunLoop");
    sUnscheduleMonitor=(__typeof__(sUnscheduleMonitor))dlsym(RTLD_DEFAULT,"IOHIDEventSystemClientUnscheduleWithRunLoop");
    sEventType=(__typeof__(sEventType))dlsym(RTLD_DEFAULT,"IOHIDEventGetType");
    sEventInteger=(__typeof__(sEventInteger))dlsym(RTLD_DEFAULT,"IOHIDEventGetIntegerValue");
    sEventFloat=(__typeof__(sEventFloat))dlsym(RTLD_DEFAULT,"IOHIDEventGetFloatValue");
    sEventChildren=(__typeof__(sEventChildren))dlsym(RTLD_DEFAULT,"IOHIDEventGetChildren");
    if (!create||!subscribe||!schedule||!sUnscheduleMonitor||!sEventType||!sEventInteger||!sEventFloat||!sEventChildren) { QPEventBridgeDiagnostic(@"Outside-touch monitor APIs unavailable."); return; }
    sMonitor=create(kCFAllocatorDefault);
    if (!sMonitor) { QPEventBridgeDiagnostic(@"Outside-touch monitor permission unavailable."); return; }
    subscribe(sMonitor,QPMonitorCallback,NULL,NULL); schedule(sMonitor,CFRunLoopGetMain(),kCFRunLoopCommonModes);
}

static void QPHIDCallback(void *target, void *refcon, IOHIDServiceRef service, IOHIDEventRef event) {
    uint64_t generation = atomic_load_explicit(&sTouchGeneration, memory_order_relaxed);
    UIWindow *window = sWindow;
    if (!window || window.hidden || !window.userInteractionEnabled) return;
    UIApplication *application = UIApplication.sharedApplication;
    AXEventRepresentation *representation = QPRepresentation(event);
    NSOperatingSystemVersion version = NSProcessInfo.processInfo.operatingSystemVersion;
    BOOL useAX = version.majorVersion >= 15;
    if (version.majorVersion == 15 && version.minorVersion == 0 && version.patchVersion == 0) {
        struct utsname model;
        uname(&model);
        NSString *name = @(model.machine);
        useAX = [name hasPrefix:@"iPhone13,"] || [name hasPrefix:@"iPhone14,"];
    }
    if (!useAX) {
        if ([application respondsToSelector:@selector(_enqueueHIDEvent:)]) [application _enqueueHIDEvent:event];
        return;
    }
    if (!representation) return;
    // Snapshot the whole HID packet before returning to BackBoard. Per-path
    // phases are applied against the delivered touch state by the source,
    // after the preceding batch's deferred cleanup.
    NSMutableArray<NSDictionary *> *paths = [NSMutableArray new];
    for (AXEventPathInfoRepresentation *path in [representation handInfo].paths) {
        NSInteger pathID = path.pathIdentity;
        if (pathID <= 0) continue;
        CGPoint location = [path respondsToSelector:@selector(pathLocation)] ? path.pathLocation : representation.location;
        NSMutableDictionary *value = [@{@"identity":@(pathID), @"location":[NSValue valueWithCGPoint:location]} mutableCopy];
        if ([path respondsToSelector:@selector(pathProximity)]) value[@"proximity"] = @(path.pathProximity);
        [paths addObject:[value copy]];
    }
    if (!paths.count) return;
    NSDictionary *batch = @{@"generation":@(generation), @"paths":[paths copy],
        @"down":@(representation.isTouchDown), @"cancel":@(representation.isCancel),
        @"lift":@(representation.isLift), @"inRangeLift":@(representation.isInRangeLift),
        @"inRange":@(representation.isInRange)};
    dispatch_async(dispatch_get_main_queue(), ^{
        if (generation != atomic_load_explicit(&sTouchGeneration, memory_order_relaxed) || !sTouchSource ||
            !sWindow || sWindow.hidden || !sWindow.userInteractionEnabled) return;
        [sTouchBatches addObject:batch];
        QPSignalTouchSource();
    });
}

void QPInstallGlobalEventBridge(UIWindow *window) {
    sWindow = window;
    sTouches = [NSMutableDictionary new];
    sCapturedPaths = [NSMutableSet new];
    sTouchBatches = [NSMutableArray new];
    sResetTouches = [NSMutableArray new];
    sDeliveredTouches = nil;
    atomic_fetch_add_explicit(&sTouchGeneration, 1, memory_order_relaxed);
    if (!sTouchSource) {
        CFRunLoopSourceContext context = {0};
        context.perform = QPTouchSourcePerform;
        sTouchSource = CFRunLoopSourceCreate(kCFAllocatorDefault, -2, &context);
        if (sTouchSource) CFRunLoopAddSource(CFRunLoopGetMain(), sTouchSource, kCFRunLoopCommonModes);
        else { sReady = NO; QPEventBridgeDiagnostic(@"Touch delivery run-loop source unavailable."); }
    }
    if (QPPrivate.registerHID) QPPrivate.registerHID(QPHIDCallback);
    QPInstallOutsideMonitor();
    QPEventBridgeDiagnostic(sReady ? @"Global HID bridge installed." : @"Global HID callback installed; private event dispatcher initialization was incomplete.");
}
