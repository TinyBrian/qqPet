#import "QPState.h"
#import <sys/stat.h>
#import <signal.h>
#import <unistd.h>
#import <fcntl.h>
#import <sys/file.h>
#import <errno.h>

NSError *QPError(NSString *message) { return [NSError errorWithDomain:@"net.ankio.qqpet" code:1 userInfo:@{NSLocalizedDescriptionKey:message ?: @"Unknown failure"}]; }
NSString *QPDefaultStateDirectory(void) {
    NSString *base = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES).firstObject;
    return [base stringByAppendingPathComponent:@"QQPet"];
}
BOOL QPProcessAlive(NSDictionary *status) {
    NSNumber *pid = status[@"pid"];
    if (![pid isKindOfClass:NSNumber.class] || pid.intValue <= 1 || ![status[@"phase"] isEqual:@"running"]) return NO;
    if (NSDate.date.timeIntervalSince1970-[status[@"updatedAt"] doubleValue]>5) return NO;
    NSString *directory=status[@"stateDir"];
    if (![directory isKindOfClass:NSString.class]) return NO;
    int lock=open([[directory stringByAppendingPathComponent:@"hud.lock"] fileSystemRepresentation],O_RDONLY|O_NOFOLLOW);
    if (lock<0) return NO;
    BOOL held=flock(lock,LOCK_EX|LOCK_NB)<0 && errno==EWOULDBLOCK;
    if (!held) flock(lock,LOCK_UN);
    close(lock);
    if (!held) return NO;
    return kill(pid.intValue, 0) == 0 || errno == EPERM;
}
@implementation QPState {
    NSString *_directory;
    uid_t _owner;
    dispatch_queue_t _fileQueue;
}
- (instancetype)initWithDirectory:(NSString *)directory error:(NSError **)error {
    if ((self = [super init])) {
        _directory = [[directory stringByStandardizingPath] stringByResolvingSymlinksInPath];
        _fileQueue = dispatch_queue_create("net.ankio.qqpet.files", DISPATCH_QUEUE_SERIAL);
        if (![NSFileManager.defaultManager createDirectoryAtPath:_directory withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:error]) return nil;
        struct stat info;
        if (lstat(_directory.fileSystemRepresentation, &info) || !S_ISDIR(info.st_mode)) { if (error) *error = QPError(@"State directory must be a real directory."); return nil; }
        _owner = info.st_uid;
        if (getuid() != 0 && _owner != getuid()) { if (error) *error = QPError(@"State directory belongs to a different user."); return nil; }
        if (![self readText:@"generation"]) [self writeText:NSUUID.UUID.UUIDString name:@"generation" error:NULL];
    }
    return self;
}
- (NSString *)directory { return _directory; }
- (uid_t)owner { return _owner; }
- (dispatch_queue_t)fileQueue { return _fileQueue; }
- (NSString *)path:(NSString *)name { return [_directory stringByAppendingPathComponent:name]; }
- (BOOL)validName:(NSString *)name { return name.length && [name.lastPathComponent isEqual:name] && ![name isEqual:@"."] && ![name isEqual:@".."] && ![name containsString:@"/"]; }
- (NSString *)readText:(NSString *)name {
    if (![self validName:name]) return nil;
    if ([name isEqual:@"save.json"]) {
        NSDictionary *record=[self readJSON:@"save-record.json"];
        if ([record[@"text"] isKindOfClass:NSString.class]) return record[@"text"];
    }
    return [NSString stringWithContentsOfFile:[self path:name] encoding:NSUTF8StringEncoding error:NULL];
}
- (NSDictionary *)readJSON:(NSString *)name {
    NSString *text = [self readText:name];
    id value = text ? [NSJSONSerialization JSONObjectWithData:[text dataUsingEncoding:NSUTF8StringEncoding] options:0 error:NULL] : nil;
    return [value isKindOfClass:NSDictionary.class] ? value : nil;
}
- (BOOL)writeText:(NSString *)text name:(NSString *)name error:(NSError **)error {
    if (![self validName:name]) { if (error) *error = QPError(@"Invalid state filename."); return NO; }
    NSString *path = [self path:name];
    if ([name isEqual:@"save.json"]) {
        if (![self writeJSON:@{@"text":text,@"generation":self.generation} name:@"save-record.json" error:error]) return NO;
        // The record is authoritative; the plain JSON mirror supports manual recovery/export.
        [text writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:NULL];
        chmod(path.fileSystemRepresentation,0600); if (getuid()==0) chown(path.fileSystemRepresentation,_owner,(gid_t)-1);
        return YES;
    }
    if (![text writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:error]) return NO;
    // Atomic replacement creates a new inode. Keep every replacement readable by the manager UID.
    chmod(path.fileSystemRepresentation, 0600);
    if (getuid() == 0) chown(path.fileSystemRepresentation, _owner, (gid_t)-1);
    return YES;
}
- (BOOL)writeJSON:(NSDictionary *)value name:(NSString *)name error:(NSError **)error {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:error];
    return data && [self writeText:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] name:name error:error];
}
- (NSString *)generation { NSDictionary *record=[self readJSON:@"save-record.json"]; return [record[@"generation"] isKindOfClass:NSString.class]?record[@"generation"]:([self readText:@"generation"] ?: @""); }
- (BOOL)matchesGeneration:(NSString *)generation { return generation.length && [generation isEqual:self.generation]; }
- (NSString *)replaceSave:(NSString *)text generation:(NSString *)generation backup:(BOOL)backup error:(NSError **)error {
    if (![self matchesGeneration:generation]) { if (error) *error = QPError(@"Save generation changed. Reload before writing."); return nil; }
    if (backup) { NSString *old = [self readText:@"save.json"]; if (old && ![self writeText:old name:@"save.json.bak" error:error]) return nil; }
    NSString *next = NSUUID.UUID.UUIDString;
    // One atomic inode replacement commits data and its generation together.
    if (![self writeJSON:@{@"text":text,@"generation":next} name:@"save-record.json" error:error]) return nil;
    NSString *mirror=[self path:@"save.json"];
    [text writeToFile:mirror atomically:YES encoding:NSUTF8StringEncoding error:NULL]; chmod(mirror.fileSystemRepresentation,0600);
    if (getuid()==0) chown(mirror.fileSystemRepresentation,_owner,(gid_t)-1);
    return next;
}
- (BOOL)enqueueCommand:(NSDictionary *)command instance:(NSString *)instance error:(NSError **)error {
    if (!instance.length) { if (error) *error = QPError(@"No running HUD instance."); return NO; }
    NSString *name = [NSString stringWithFormat:@"command-%020llu-%@.json", (unsigned long long)(NSDate.date.timeIntervalSince1970*1000000), NSUUID.UUID.UUIDString];
    NSMutableDictionary *record = [command mutableCopy]; record[@"instance"] = instance;
    return [self writeJSON:record name:name error:error];
}
- (NSArray<NSDictionary *> *)takeCommandsForInstance:(NSString *)instance {
    NSMutableArray *commands = [NSMutableArray new];
    NSArray *names = [[NSFileManager.defaultManager contentsOfDirectoryAtPath:_directory error:NULL] sortedArrayUsingSelector:@selector(compare:)];
    for (NSString *name in names) {
        if (![name hasPrefix:@"command-"] || ![name hasSuffix:@".json"]) continue;
        NSDictionary *record = [self readJSON:name];
        [NSFileManager.defaultManager removeItemAtPath:[self path:name] error:NULL];
        if ([record[@"instance"] isEqual:instance]) [commands addObject:record];
    }
    return commands;
}
@end
