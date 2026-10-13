#import "QPSystemTextInput.h"
#import <CoreFoundation/CFUserNotification.h>
#import <dlfcn.h>

// Signatures and flags follow CoreFoundation's CFUserNotification.h. The public
// SDK marks these exports unavailable to ordinary iOS apps; resolve and guard
// their system implementation without changing SDK availability declarations.
// Procursus uialert uses the same notification and text-field keys:
// https://github.com/ProcursusTeam/uikittools-ng/blob/6b84d79261186d070b54efa9a39850f108b52239/uialert.m
typedef struct {
    CFUserNotificationRef (*create)(CFAllocatorRef,CFTimeInterval,CFOptionFlags,SInt32 *,CFDictionaryRef);
    CFRunLoopSourceRef (*source)(CFAllocatorRef,CFUserNotificationRef,CFUserNotificationCallBack,CFIndex);
    CFDictionaryRef (*responseDictionary)(CFUserNotificationRef);
    SInt32 (*cancel)(CFUserNotificationRef);
    CFStringRef header,defaultButton,alternateButton,titles,values,topMost,keyboardTypes;
    BOOL ready;
} QPSystemAlertAPI;
static QPSystemAlertAPI QPAlert;
static NSMutableDictionary<NSValue *,QPSystemTextInput *> *QPActiveTextInputs;

static CFStringRef QPAlertKey(const char *name) {
    const CFStringRef *value=(const CFStringRef *)dlsym(RTLD_DEFAULT,name);
    return value?*value:NULL;
}
static BOOL QPLoadSystemAlert(void) {
    static dispatch_once_t once;
    dispatch_once(&once,^{
        QPAlert.create=(__typeof__(QPAlert.create))dlsym(RTLD_DEFAULT,"CFUserNotificationCreate");
        QPAlert.source=(__typeof__(QPAlert.source))dlsym(RTLD_DEFAULT,"CFUserNotificationCreateRunLoopSource");
        QPAlert.responseDictionary=(__typeof__(QPAlert.responseDictionary))dlsym(RTLD_DEFAULT,"CFUserNotificationGetResponseDictionary");
        QPAlert.cancel=(__typeof__(QPAlert.cancel))dlsym(RTLD_DEFAULT,"CFUserNotificationCancel");
        QPAlert.header=QPAlertKey("kCFUserNotificationAlertHeaderKey");
        QPAlert.defaultButton=QPAlertKey("kCFUserNotificationDefaultButtonTitleKey");
        QPAlert.alternateButton=QPAlertKey("kCFUserNotificationAlternateButtonTitleKey");
        QPAlert.titles=QPAlertKey("kCFUserNotificationTextFieldTitlesKey");
        QPAlert.values=QPAlertKey("kCFUserNotificationTextFieldValuesKey");
        QPAlert.topMost=QPAlertKey("kCFUserNotificationAlertTopMostKey");
        QPAlert.keyboardTypes=QPAlertKey("kCFUserNotificationKeyboardTypesKey");
        QPAlert.ready=QPAlert.create&&QPAlert.source&&QPAlert.responseDictionary&&QPAlert.cancel&&QPAlert.header&&QPAlert.defaultButton&&QPAlert.alternateButton&&QPAlert.titles&&QPAlert.values;
        QPActiveTextInputs=[NSMutableDictionary new];
    });
    return QPAlert.ready;
}

@interface QPSystemTextInput ()
@property(nonatomic,copy) void (^completion)(NSString *,NSString *);
- (void)completeWithFlags:(CFOptionFlags)flags;
- (void)releaseNotification:(BOOL)cancel;
@end

static void QPTextInputResponse(CFUserNotificationRef notification,CFOptionFlags flags) {
    QPSystemTextInput *editor=QPActiveTextInputs[[NSValue valueWithPointer:notification]];
    [editor completeWithFlags:flags];
}

@implementation QPSystemTextInput {
    CFUserNotificationRef _notification;
    CFRunLoopSourceRef _source;
}
- (BOOL)presentText:(NSString *)text placeholder:(NSString *)placeholder secure:(BOOL)secure keyboardType:(UIKeyboardType)keyboardType completion:(void (^)(NSString *,NSString *))completion error:(NSString **)error {
    NSAssert(NSThread.isMainThread,@"System input is managed on the HUD event loop.");
    if (!QPLoadSystemAlert()) { if (error) *error=@"此系统缺少文字输入框接口。"; return NO; }
    if (_notification) { if (error) *error=@"请先完成当前文字输入。"; return NO; }
    NSMutableDictionary *options=[@{
        (__bridge NSString *)QPAlert.header:@"输入文字",
        (__bridge NSString *)QPAlert.defaultButton:@"完成",
        (__bridge NSString *)QPAlert.alternateButton:@"取消",
        (__bridge NSString *)QPAlert.titles:@[placeholder.length?placeholder:@"文字"],
        (__bridge NSString *)QPAlert.values:@[text]
    } mutableCopy];
    if (QPAlert.topMost) options[(__bridge NSString *)QPAlert.topMost]=@YES;
    if (QPAlert.keyboardTypes) options[(__bridge NSString *)QPAlert.keyboardTypes]=@[@(keyboardType)];
    // kCFUserNotificationNoteAlertLevel, plus CFUserNotificationSecureTextField(0).
    CFOptionFlags flags=1|(secure?(1UL<<16):0);
    SInt32 creationError=0;
    _notification=QPAlert.create(kCFAllocatorDefault,0,flags,&creationError,(__bridge CFDictionaryRef)options);
    if (!_notification) { if (error) *error=[NSString stringWithFormat:@"无法显示系统文字输入框（%d）。",(int)creationError]; return NO; }
    _source=QPAlert.source(kCFAllocatorDefault,_notification,QPTextInputResponse,0);
    if (!_source) { [self cancel]; if (error) *error=@"无法接收系统文字输入结果。"; return NO; }
    self.completion=completion;
    QPActiveTextInputs[[NSValue valueWithPointer:_notification]]=self;
    CFRunLoopAddSource(CFRunLoopGetMain(),_source,kCFRunLoopCommonModes);
    return YES;
}
- (void)completeWithFlags:(CFOptionFlags)flags {
    if (!_notification) return;
    NSString *text=nil,*error=nil;
    // Only the default button commits. Alternate, other, and cancellation do not.
    if ((flags&3)==0) {
        NSDictionary *response=(__bridge NSDictionary *)QPAlert.responseDictionary(_notification);
        id value=response[(__bridge NSString *)QPAlert.values];
        if ([value isKindOfClass:NSArray.class]) value=[value firstObject];
        if ([value isKindOfClass:NSString.class]) text=[value copy];
        else error=@"系统文字输入框未返回文字。";
    }
    void (^completion)(NSString *,NSString *)=self.completion;
    [self releaseNotification:NO];
    if (completion) completion(text,error);
}
- (void)releaseNotification:(BOOL)cancel {
    if (_source) {
        CFRunLoopRemoveSource(CFRunLoopGetMain(),_source,kCFRunLoopCommonModes);
        CFRunLoopSourceInvalidate(_source); CFRelease(_source); _source=NULL;
    }
    if (_notification) {
        [QPActiveTextInputs removeObjectForKey:[NSValue valueWithPointer:_notification]];
        if (cancel) QPAlert.cancel(_notification);
        CFRelease(_notification); _notification=NULL;
    }
    self.completion=nil;
}
- (void)cancel { [self releaseNotification:YES]; }
@end
