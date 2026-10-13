#import <UIKit/UIKit.h>

// Private declarations are in the pinned TrollSpeed headers, not invented here.
@interface QPHUDApplication : UIApplication
@end

FOUNDATION_EXPORT void QPInstallGlobalEventBridge(UIWindow *window);
// Passive notification only; the original HID event continues to its owner.
FOUNDATION_EXPORT void QPSetOutsideTouchHandler(void (^handler)(void));
FOUNDATION_EXPORT CGPoint QPLatestGlobalTouchPoint(void);
FOUNDATION_EXPORT BOOL QPGlobalEventBridgeReady(void);
FOUNDATION_EXPORT void QPResetCapturedTouches(void);
FOUNDATION_EXPORT void QPEventBridgeDiagnostic(NSString *message);
