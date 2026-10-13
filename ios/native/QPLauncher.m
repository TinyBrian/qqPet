#import "QPLauncher.h"
#import <spawn.h>
#import <mach-o/dyld.h>
#import <dlfcn.h>
#import <sys/wait.h>
#import <errno.h>
#import <string.h>
// Signatures from TrollSpeed HUDHelper.mm and TrollStore Shared/TSUtil.m.
typedef int (*QPPersona)(const posix_spawnattr_t *, uid_t, uint32_t);
typedef int (*QPPersonaID)(const posix_spawnattr_t *, uid_t);
extern char **environ;
BOOL QPStartHUD(QPState *state, NSError **error) {
    if (QPProcessAlive([state readJSON:@"hud.json"])) return YES;
    __auto_type setPersona = (QPPersona)dlsym(RTLD_DEFAULT, "posix_spawnattr_set_persona_np");
    __auto_type setUID = (QPPersonaID)dlsym(RTLD_DEFAULT, "posix_spawnattr_set_persona_uid_np");
    __auto_type setGID = (QPPersonaID)dlsym(RTLD_DEFAULT, "posix_spawnattr_set_persona_gid_np");
    if (!setPersona || !setUID || !setGID) { if (error) *error = QPError(@"Root persona APIs are unavailable on this iOS build."); return NO; }
    NSString *path = NSBundle.mainBundle.executablePath;
    const char *args[] = {path.fileSystemRepresentation, "--hud", "--state-dir", state.directory.fileSystemRepresentation, NULL};
    posix_spawnattr_t attributes;
    posix_spawnattr_init(&attributes);
    int result = setPersona(&attributes, 99, 1);
    if (!result) result = setUID(&attributes, 0);
    if (!result) result = setGID(&attributes, 0);
    if (!result) result = posix_spawnattr_setpgroup(&attributes, 0);
    if (!result) result = posix_spawnattr_setflags(&attributes, POSIX_SPAWN_SETPGROUP);
    pid_t pid = 0;
    if (!result) result = posix_spawn(&pid, path.fileSystemRepresentation, NULL, &attributes, (char *const *)args, environ);
    posix_spawnattr_destroy(&attributes);
    if (result) { if (error) *error = QPError([NSString stringWithFormat:@"HUD launch failed (%d: %s). Install with TrollStore or an active jailbreak preserving persona-mgmt and no-sandbox entitlements.", result, strerror(result)]); return NO; }
    // Never block the manager waiting for the lifetime of a persistent HUD.
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY,0), ^{ int status; while (waitpid(pid,&status,0) < 0 && errno == EINTR) {} });
    return YES;
}
BOOL QPStopHUD(QPState *state, NSError **error) {
    NSDictionary *status = [state readJSON:@"hud.json"];
    if (!QPProcessAlive(status)) return YES;
    return [state enqueueCommand:@{@"op":@"quit"} instance:status[@"instance"] error:error];
}
