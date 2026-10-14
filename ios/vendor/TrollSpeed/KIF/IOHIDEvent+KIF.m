//
//  IOHIDEvent+KIF.m
//  KIF
//
//  Created by Thomas Bonnin on 7/6/15.
//

#import "IOHIDEvent+KIF.h"
#import <dlfcn.h>
#import <UIKit/UIKit.h>
#import <mach/mach_time.h>
#import <objc/runtime.h>

#define IOHIDEventFieldBase(type) (type << 16)

#ifdef __LP64__
typedef double IOHIDFloat;
#else
typedef float IOHIDFloat;
#endif

typedef UInt32 IOOptionBits;
typedef uint32_t IOHIDDigitizerTransducerType;
typedef uint32_t IOHIDEventField;
typedef uint32_t IOHIDEventType;

void IOHIDEventAppendEvent(IOHIDEventRef event, IOHIDEventRef childEvent);
void IOHIDEventSetIntegerValue(IOHIDEventRef event, IOHIDEventField field,
                               int value);
void IOHIDEventSetSenderID(IOHIDEventRef event, uint64_t sender);

// Derived from
// https://opensource.apple.com/source/IOHIDFamily/IOHIDFamily-606.1.7/IOHIDFamily/IOHIDEventTypes.h

enum {
  kIOHIDDigitizerTransducerTypeStylus = 0,
  kIOHIDDigitizerTransducerTypePuck,
  kIOHIDDigitizerTransducerTypeFinger,
  kIOHIDDigitizerTransducerTypeHand
};

enum {
  kIOHIDEventTypeNULL, // 0
  kIOHIDEventTypeVendorDefined,
  kIOHIDEventTypeButton,
  kIOHIDEventTypeKeyboard,
  kIOHIDEventTypeTranslation,
  kIOHIDEventTypeRotation, // 5
  kIOHIDEventTypeScroll,
  kIOHIDEventTypeScale,
  kIOHIDEventTypeZoom,
  kIOHIDEventTypeVelocity,
  kIOHIDEventTypeOrientation, // 10
  kIOHIDEventTypeDigitizer,
  kIOHIDEventTypeAmbientLightSensor,
  kIOHIDEventTypeAccelerometer,
  kIOHIDEventTypeProximity,
  kIOHIDEventTypeTemperature, // 15
  kIOHIDEventTypeNavigationSwipe,
  kIOHIDEventTypePointer,
  kIOHIDEventTypeProgress,
  kIOHIDEventTypeMultiAxisPointer,
  kIOHIDEventTypeGyro, // 20
  kIOHIDEventTypeCompass,
  kIOHIDEventTypeZoomToggle,
  kIOHIDEventTypeDockSwipe, // Just like kIOHIDEventTypeNavigationSwipe, but
                            // intended for consumption by Dock
  kIOHIDEventTypeSymbolicHotKey,
  kIOHIDEventTypePower, // 25
  kIOHIDEventTypeLED,
  kIOHIDEventTypeFluidTouchGesture, // This will eventually superseed Navagation
                                    // and Dock swipes
  kIOHIDEventTypeBoundaryScroll,
  kIOHIDEventTypeBiometric,
  kIOHIDEventTypeUnicode, // 30
  kIOHIDEventTypeAtmosphericPressure,
  kIOHIDEventTypeUndefined,
  kIOHIDEventTypeCount, // This should always be last

  // DEPRECATED:
  kIOHIDEventTypeSwipe = kIOHIDEventTypeNavigationSwipe,
  kIOHIDEventTypeMouse = kIOHIDEventTypePointer
};

enum {
  kIOHIDDigitizerEventRange = 1 << 0,
  kIOHIDDigitizerEventTouch = 1 << 1,
  kIOHIDDigitizerEventPosition = 1 << 2,
  kIOHIDDigitizerEventStop = 1 << 3,
  kIOHIDDigitizerEventPeak = 1 << 4,
  kIOHIDDigitizerEventIdentity = 1 << 5,
  kIOHIDDigitizerEventAttribute = 1 << 6,
  kIOHIDDigitizerEventCancel = 1 << 7,
  kIOHIDDigitizerEventStart = 1 << 8,
  kIOHIDDigitizerEventResting = 1 << 9,
  kIOHIDDigitizerEventFromEdgeFlat = 1 << 10,
  kIOHIDDigitizerEventFromEdgeTip = 1 << 11,
  kIOHIDDigitizerEventFromCorner = 1 << 12,
  kIOHIDDigitizerEventSwipePending = 1 << 13,
  kIOHIDDigitizerEventSwipeUp = 1 << 24,
  kIOHIDDigitizerEventSwipeDown = 1 << 25,
  kIOHIDDigitizerEventSwipeLeft = 1 << 26,
  kIOHIDDigitizerEventSwipeRight = 1 << 27,
  kIOHIDDigitizerEventSwipeMask = 0xFF << 24,
};

enum {
  kIOHIDEventFieldDigitizerX = IOHIDEventFieldBase(kIOHIDEventTypeDigitizer),
  kIOHIDEventFieldDigitizerY,
  kIOHIDEventFieldDigitizerZ,
  kIOHIDEventFieldDigitizerButtonMask,
  kIOHIDEventFieldDigitizerType,
  kIOHIDEventFieldDigitizerIndex,
  kIOHIDEventFieldDigitizerIdentity,
  kIOHIDEventFieldDigitizerEventMask,
  kIOHIDEventFieldDigitizerRange,
  kIOHIDEventFieldDigitizerTouch,
  kIOHIDEventFieldDigitizerPressure,
  kIOHIDEventFieldDigitizerAuxiliaryPressure, // BarrelPressure
  kIOHIDEventFieldDigitizerTwist,
  kIOHIDEventFieldDigitizerTiltX,
  kIOHIDEventFieldDigitizerTiltY,
  kIOHIDEventFieldDigitizerAltitude,
  kIOHIDEventFieldDigitizerAzimuth,
  kIOHIDEventFieldDigitizerQuality,
  kIOHIDEventFieldDigitizerDensity,
  kIOHIDEventFieldDigitizerIrregularity,
  kIOHIDEventFieldDigitizerMajorRadius,
  kIOHIDEventFieldDigitizerMinorRadius,
  kIOHIDEventFieldDigitizerCollection,
  kIOHIDEventFieldDigitizerCollectionChord,
  kIOHIDEventFieldDigitizerChildEventMask,
  kIOHIDEventFieldDigitizerIsDisplayIntegrated,
  kIOHIDEventFieldDigitizerQualityRadiiAccuracy,
};

IOHIDEventRef IOHIDEventCreateDigitizerEvent(
    CFAllocatorRef allocator, AbsoluteTime timeStamp,
    IOHIDDigitizerTransducerType type, uint32_t index, uint32_t identity,
    uint32_t eventMask, uint32_t buttonMask, IOHIDFloat x, IOHIDFloat y,
    IOHIDFloat z, IOHIDFloat tipPressure, IOHIDFloat barrelPressure,
    Boolean range, Boolean touch, IOOptionBits options);

IOHIDEventRef IOHIDEventCreateDigitizerFingerEventWithQuality(
    CFAllocatorRef allocator, AbsoluteTime timeStamp, uint32_t index,
    uint32_t identity, uint32_t eventMask, IOHIDFloat x, IOHIDFloat y,
    IOHIDFloat z, IOHIDFloat tipPressure, IOHIDFloat twist,
    IOHIDFloat minorRadius, IOHIDFloat majorRadius, IOHIDFloat quality,
    IOHIDFloat density, IOHIDFloat irregularity, Boolean range, Boolean touch,
    IOOptionBits options);

static __typeof__(&IOHIDEventAppendEvent) qp_IOHIDEventAppendEvent;
static __typeof__(&IOHIDEventSetIntegerValue) qp_IOHIDEventSetIntegerValue;
static __typeof__(&IOHIDEventSetSenderID) qp_IOHIDEventSetSenderID;
static __typeof__(&IOHIDEventCreateDigitizerEvent) qp_IOHIDEventCreateDigitizerEvent;
static __typeof__(&IOHIDEventCreateDigitizerFingerEventWithQuality) qp_IOHIDEventCreateDigitizerFingerEventWithQuality;

static char kif_touchPathIdentityKey;

void kif_setTouchPathIdentity(UITouch *touch, uint32_t identity)
{
    if (!touch) return;
    objc_setAssociatedObject(touch, &kif_touchPathIdentityKey,
                             identity ? @(identity) : nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

IOHIDEventRef kif_IOHIDEventWithTouches(NSArray *touches)
{
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        dlopen("/System/Library/Frameworks/IOKit.framework/IOKit", RTLD_NOW | RTLD_GLOBAL);
        qp_IOHIDEventAppendEvent = (__typeof__(qp_IOHIDEventAppendEvent))dlsym(RTLD_DEFAULT,"IOHIDEventAppendEvent");
        qp_IOHIDEventSetIntegerValue = (__typeof__(qp_IOHIDEventSetIntegerValue))dlsym(RTLD_DEFAULT,"IOHIDEventSetIntegerValue");
        qp_IOHIDEventSetSenderID = (__typeof__(qp_IOHIDEventSetSenderID))dlsym(RTLD_DEFAULT,"IOHIDEventSetSenderID");
        qp_IOHIDEventCreateDigitizerEvent = (__typeof__(qp_IOHIDEventCreateDigitizerEvent))dlsym(RTLD_DEFAULT,"IOHIDEventCreateDigitizerEvent");
        qp_IOHIDEventCreateDigitizerFingerEventWithQuality = (__typeof__(qp_IOHIDEventCreateDigitizerFingerEventWithQuality))dlsym(RTLD_DEFAULT,"IOHIDEventCreateDigitizerFingerEventWithQuality");
    });
    if (!qp_IOHIDEventAppendEvent || !qp_IOHIDEventSetIntegerValue || !qp_IOHIDEventSetSenderID || !qp_IOHIDEventCreateDigitizerEvent || !qp_IOHIDEventCreateDigitizerFingerEventWithQuality) return NULL;

  uint64_t abTime = mach_absolute_time();
  AbsoluteTime timeStamp;
  timeStamp.hi = (UInt32)(abTime >> 32);
  timeStamp.lo = (UInt32)(abTime);

  BOOL anyTouching = NO;
  for (UITouch *touch in touches) {
    if (touch.phase != UITouchPhaseEnded && touch.phase != UITouchPhaseCancelled) {
      anyTouching = YES;
      break;
    }
  }

  IOHIDEventRef handEvent = qp_IOHIDEventCreateDigitizerEvent(
      kCFAllocatorDefault,               // allocator 内存分配器
      timeStamp,                         // timestamp 时间戳
      kIOHIDDigitizerTransducerTypeHand, // type
      0,                                 // index
      0,                                 // identity
      kIOHIDDigitizerEventTouch,         // eventMask
      0,                                 // buttonMask
      0,                                 // x
      0,                                 // y
      0,                                 // z
      0,                                 // tipPressure
      0,                                 // barrelPressure
      0,                                 // range
      anyTouching,                       // touch
      0);                                // options

  if (!handEvent) return NULL;

  qp_IOHIDEventSetIntegerValue(handEvent,
                            kIOHIDEventFieldDigitizerIsDisplayIntegrated, true);

  for (UITouch *touch in touches)
  {
    uint32_t eventMask =
        (touch.phase == UITouchPhaseMoved)
            ? kIOHIDDigitizerEventPosition
            : (kIOHIDDigitizerEventRange | kIOHIDDigitizerEventTouch);

    if (touch.phase == UITouchPhaseCancelled) eventMask |= kIOHIDDigitizerEventCancel;
    uint32_t isTouching = (touch.phase == UITouchPhaseEnded || touch.phase == UITouchPhaseCancelled) ? 0 : 1;
    NSNumber *pathIdentity = objc_getAssociatedObject(touch, &kif_touchPathIdentityKey);
    uint32_t index = pathIdentity ? pathIdentity.unsignedIntValue : (uint32_t)[touches indexOfObject:touch] + 1;
    uint32_t identity = pathIdentity ? pathIdentity.unsignedIntValue : 2;
    CGPoint touchLocation = [touch locationInView:touch.window];
    IOHIDEventRef fingerEvent = qp_IOHIDEventCreateDigitizerFingerEventWithQuality(
        kCFAllocatorDefault,                       // allocator
        timeStamp,                                 // timestamp
        index,                                     // index
        identity,                                  // identity
        eventMask,                                 // eventMask
        (IOHIDFloat)touchLocation.x,               // x
        (IOHIDFloat)touchLocation.y,               // y
        0.0,                                       // z
        0,                                         // tipPressure
        0,                                         // twist
        5.0,                                       // minor radius
        5.0,                                       // major radius
        1.0,                                       // quality
        1.0,                                       // density
        1.0,                                       // irregularity
        (IOHIDFloat)isTouching,                    // range
        (IOHIDFloat)isTouching,                    // touch
        0);                                        // options

    if (!fingerEvent) {
      CFRelease(handEvent);
      return NULL;
    }

    qp_IOHIDEventSetIntegerValue(fingerEvent,
                              kIOHIDEventFieldDigitizerIsDisplayIntegrated, 1);

    qp_IOHIDEventAppendEvent(handEvent, fingerEvent);
    CFRelease(fingerEvent);
  }

  return handEvent;
}
