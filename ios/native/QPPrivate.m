#import "QPPrivate.h"
#import "QPState.h"
#import <dlfcn.h>
QPPrivateAPI QPPrivate = {0};

// Same system entry point used by Procursus uiopen --bundleid.
// https://github.com/ProcursusTeam/uikittools-ng/blob/6b84d79261186d070b54efa9a39850f108b52239/uiopen.m
@interface LSApplicationWorkspace : NSObject
+ (instancetype)defaultWorkspace;
- (BOOL)openApplicationWithBundleID:(NSString *)bundleIdentifier;
@end

BOOL QPActivateManager(NSString *bundleIdentifier) {
    static dispatch_once_t once;
    dispatch_once(&once,^{ dlopen("/System/Library/Frameworks/MobileCoreServices.framework/MobileCoreServices",RTLD_NOW|RTLD_GLOBAL); });
    Class workspaceClass=NSClassFromString(@"LSApplicationWorkspace");
    if (!bundleIdentifier.length || ![workspaceClass respondsToSelector:@selector(defaultWorkspace)]) return NO;
    LSApplicationWorkspace *workspace=[workspaceClass defaultWorkspace];
    return [workspace respondsToSelector:@selector(openApplicationWithBundleID:)] && [workspace openApplicationWithBundleID:bundleIdentifier];
}

BOOL QPLoadPrivateAPI(NSError **error) {
    for (NSString *name in @[@"GraphicsServices",@"BackBoardServices",@"SpringBoardServices",@"FrontBoardServices"])
        dlopen([[NSString stringWithFormat:@"/System/Library/PrivateFrameworks/%@.framework/%@",name,name] fileSystemRepresentation], RTLD_NOW|RTLD_GLOBAL);
#define QP_RESOLVE(field,symbol) QPPrivate.field = (__typeof__(QPPrivate.field))dlsym(RTLD_DEFAULT,#symbol)
    QP_RESOLVE(graphicsInitialize,GSInitialize); QP_RESOLVE(startDisplay,BKSDisplayServicesStart);
    QP_RESOLVE(initializeApplication,UIApplicationInitialize); QP_RESOLVE(instantiateApplication,UIApplicationInstantiateSingleton);
    QP_RESOLVE(initializeEvents,GSEventInitialize); QP_RESOLVE(initializeExtensionEvents,GSEventInitializeAsExtension);
    QP_RESOLVE(pushEventMode,GSEventPushRunLoopMode); QP_RESOLVE(runEvents,GSEventRun);
    QP_RESOLVE(registerHID,BKSHIDEventRegisterEventCallback); QP_RESOLVE(springBoardPort,SBSSpringBoardServerPort);
    QP_RESOLVE(getLockStatus,SBGetScreenLockStatus);
#undef QP_RESOLVE
    BOOL eventsAvailable = NSProcessInfo.processInfo.operatingSystemVersion.majorVersion<15 ? QPPrivate.initializeExtensionEvents!=NULL : QPPrivate.initializeEvents!=NULL;
    if (!QPPrivate.graphicsInitialize || !QPPrivate.startDisplay || !QPPrivate.initializeApplication || !QPPrivate.instantiateApplication || !QPPrivate.pushEventMode || !QPPrivate.runEvents || !QPPrivate.registerHID ||
        !eventsAvailable) {
        if (error) *error = QPError(@"Required UIKit/BackBoard/GraphicsServices HUD export missing on this iOS build.");
        return NO;
    }
    return YES;
}
