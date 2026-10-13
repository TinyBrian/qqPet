#import <Foundation/Foundation.h>
#import "BackboardServices.h"
#import "SpringBoardServices.h"
// Types are derived from the pinned source headers. No guessed symbol signatures.
typedef struct {
    __typeof__(&GSInitialize) graphicsInitialize;
    __typeof__(&BKSDisplayServicesStart) startDisplay;
    __typeof__(&UIApplicationInitialize) initializeApplication;
    __typeof__(&UIApplicationInstantiateSingleton) instantiateApplication;
    __typeof__(&GSEventInitialize) initializeEvents;
    __typeof__(&GSEventInitializeAsExtension) initializeExtensionEvents;
    __typeof__(&GSEventPushRunLoopMode) pushEventMode;
    __typeof__(&GSEventRun) runEvents;
    __typeof__(&BKSHIDEventRegisterEventCallback) registerHID;
    __typeof__(&SBSSpringBoardServerPort) springBoardPort;
    __typeof__(&SBGetScreenLockStatus) getLockStatus;
    __typeof__(&SBSLaunchApplicationWithIdentifierAndLaunchOptions) launchApplication;
} QPPrivateAPI;
FOUNDATION_EXPORT QPPrivateAPI QPPrivate;
FOUNDATION_EXPORT BOOL QPLoadPrivateAPI(NSError **error);
