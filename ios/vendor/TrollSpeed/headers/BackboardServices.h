#import <Foundation/Foundation.h>
#import "IOKit+SPI.h"

#if __cplusplus
extern "C" {
#endif
void *BKSHIDEventRegisterEventCallback(void (*)(void *, void *, IOHIDServiceRef, IOHIDEventRef));
void UIApplicationInstantiateSingleton(id aclass);
void UIApplicationInitialize();
void BKSDisplayServicesStart();
void GSInitialize();
void GSEventInitialize(Boolean registerPurple);
// The no-argument extension initializer binds the event run loop without
// registering a Purple application port (Darwin 20 GraphicsServices export).
void GSEventInitializeAsExtension(void);
void GSEventPopRunLoopMode(CFStringRef mode);
void GSEventPushRunLoopMode(CFStringRef mode);
void GSEventRun();
void GSEventRegisterEventCallBack(void (*)(GSEventRef));
#if __cplusplus
}
#endif
