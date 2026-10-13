#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN
/** System-hosted text input, independent of the manager's foreground scene. */
@interface QPSystemTextInput : NSObject
- (BOOL)presentText:(NSString *)text
        placeholder:(NSString *)placeholder
             secure:(BOOL)secure
       keyboardType:(UIKeyboardType)keyboardType
         completion:(void (^)(NSString * _Nullable value, NSString * _Nullable error))completion
              error:(NSString * _Nullable * _Nullable)error;
- (void)cancel;
@end
NS_ASSUME_NONNULL_END
