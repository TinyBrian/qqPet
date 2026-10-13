#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
/** Read-only, loopback-only HTTP origin for bundled Ruffle and SWF assets. */
@interface QQAssetServer : NSObject
@property(nonatomic, readonly) uint16_t port;
@property(nonatomic) BOOL highResolution;
- (instancetype)initWithRoot:(NSString *)root;
- (instancetype)initWithWebRoot:(NSString *)webRoot assetRoot:(NSString *)assetRoot port:(uint16_t)port;
- (BOOL)start:(NSError * _Nullable * _Nullable)error;
- (void)stop;
@end
NS_ASSUME_NONNULL_END
