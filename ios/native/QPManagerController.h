#import <UIKit/UIKit.h>
#import "QPState.h"
NS_ASSUME_NONNULL_BEGIN
@interface QPManagerController : UITableViewController
- (instancetype)initWithState:(QPState *)state;
- (void)poll;
@end
NS_ASSUME_NONNULL_END
