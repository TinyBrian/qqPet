#import <Foundation/Foundation.h>
#import <sys/types.h>

NS_ASSUME_NONNULL_BEGIN
@interface QPState : NSObject
@property(nonatomic, readonly) NSString *directory;
@property(nonatomic, readonly) uid_t owner;
@property(nonatomic, readonly) dispatch_queue_t fileQueue;
- (instancetype)initWithDirectory:(NSString *)directory error:(NSError **)error;
- (NSString *)path:(NSString *)name;
- (nullable NSDictionary *)readJSON:(NSString *)name;
- (BOOL)writeJSON:(NSDictionary *)value name:(NSString *)name error:(NSError **)error;
- (BOOL)writeText:(NSString *)text name:(NSString *)name error:(NSError **)error;
- (nullable NSString *)readText:(NSString *)name;
- (NSString *)generation;
- (BOOL)matchesGeneration:(NSString *)generation;
- (nullable NSString *)replaceSave:(NSString *)text generation:(NSString *)generation backup:(BOOL)backup error:(NSError **)error;
- (BOOL)enqueueCommand:(NSDictionary *)command instance:(NSString *)instance error:(NSError **)error;
- (NSArray<NSDictionary *> *)takeCommandsForInstance:(NSString *)instance;
@end
FOUNDATION_EXPORT NSError *QPError(NSString *message);
FOUNDATION_EXPORT BOOL QPProcessAlive(NSDictionary * _Nullable status);
FOUNDATION_EXPORT NSString *QPDefaultStateDirectory(void);
NS_ASSUME_NONNULL_END
