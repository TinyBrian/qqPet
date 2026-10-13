#import "QPPrivate.h"
#import "QPState.h"
#import <dlfcn.h>
QPPrivateAPI QPPrivate = {0};
BOOL QPLoadPrivateAPI(NSError **error) {
    for (NSString *name in @[@"GraphicsServices",@"BackBoardServices",@"SpringBoardServices",@"FrontBoardServices"])
        dlopen([[NSString stringWithFormat:@"/System/Library/PrivateFrameworks/%@.framework/%@",name,name] fileSystemRepresentation], RTLD_NOW|RTLD_GLOBAL);
#define QP_RESOLVE(field,symbol) QPPrivate.field = (__typeof__(QPPrivate.field))dlsym(RTLD_DEFAULT,#symbol)
    QP_RESOLVE(graphicsInitialize,GSInitialize); QP_RESOLVE(startDisplay,BKSDisplayServicesStart);
    QP_RESOLVE(initializeApplication,UIApplicationInitialize); QP_RESOLVE(instantiateApplication,UIApplicationInstantiateSingleton);
    QP_RESOLVE(initializeEvents,GSEventInitialize); QP_RESOLVE(initializeExtensionEvents,GSEventInitializeAsExtension);
    QP_RESOLVE(pushEventMode,GSEventPushRunLoopMode); QP_RESOLVE(runEvents,GSEventRun);
    QP_RESOLVE(registerHID,BKSHIDEventRegisterEventCallback); QP_RESOLVE(springBoardPort,SBSSpringBoardServerPort);
    QP_RESOLVE(getLockStatus,SBGetScreenLockStatus); QP_RESOLVE(launchApplication,SBSLaunchApplicationWithIdentifierAndLaunchOptions);
#undef QP_RESOLVE
    if (!QPPrivate.graphicsInitialize || !QPPrivate.startDisplay || !QPPrivate.initializeApplication || !QPPrivate.instantiateApplication || !QPPrivate.pushEventMode || !QPPrivate.runEvents || !QPPrivate.registerHID ||
        (!QPPrivate.initializeExtensionEvents && (!QPPrivate.initializeEvents || NSProcessInfo.processInfo.operatingSystemVersion.majorVersion<15))) {
        if (error) *error = QPError(@"Required UIKit/BackBoard/GraphicsServices HUD export missing on this iOS build.");
        return NO;
    }
    return YES;
}
