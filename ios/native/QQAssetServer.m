#import "QQAssetServer.h"
#include <arpa/inet.h>
#include <sys/socket.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>

static BOOL QQSend(int fd, const void *bytes, size_t length) {
    const char *cursor = (const char *)bytes;
    while (length) {
        ssize_t n = send(fd, cursor, length, 0);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) return NO;
        cursor += n; length -= n;
    }
    return YES;
}

@implementation QQAssetServer {
    NSString *_root;
    NSString *_assetRoot;
    NSMutableDictionary *_listings;
    dispatch_queue_t _queue;
    dispatch_source_t _source;
    uint16_t _port;
}
- (instancetype)initWithRoot:(NSString *)root {
    return [self initWithWebRoot:root assetRoot:root port:0];
}
- (instancetype)initWithWebRoot:(NSString *)webRoot assetRoot:(NSString *)assetRoot port:(uint16_t)port {
    if ((self = [super init])) {
        _root = [[webRoot stringByStandardizingPath] stringByResolvingSymlinksInPath];
        _assetRoot = [[assetRoot stringByStandardizingPath] stringByResolvingSymlinksInPath];
        _port = port;
        _listings = [NSMutableDictionary new];
        _queue = dispatch_queue_create("net.ankio.qqpet.assets", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}
- (uint16_t)port { return _port; }
- (BOOL)start:(NSError **)error {
    if (_source) return YES;
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    // Preserve the origin across a stop/start while previous HTTP connections
    // remain in TIME_WAIT. This does not permit a second live listener.
    int reuse = 1;
    if (fd >= 0) setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    struct sockaddr_in addr = {};
    addr.sin_family = AF_INET; addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(_port);
    if (fd < 0 || bind(fd, (struct sockaddr *)&addr, sizeof(addr)) || listen(fd, 8)) {
        int code = errno; if (fd >= 0) close(fd);
        if (error) *error = [NSError errorWithDomain:NSPOSIXErrorDomain code:code userInfo:nil];
        return NO;
    }
    socklen_t size = sizeof(addr);
    getsockname(fd, (struct sockaddr *)&addr, &size);
    _port = ntohs(addr.sin_port);
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_NONBLOCK);
    _source = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, fd, 0, _queue);
    __weak QQAssetServer *weakSelf = self;
    dispatch_source_set_event_handler(_source, ^{
        QQAssetServer *server = weakSelf;
        for (;;) {
            int client = accept(fd, NULL, NULL);
            if (client < 0) break;
            // Darwin accepts inherit O_NONBLOCK: wait for the request bytes rather
            // than treating EAGAIN immediately after accept as an invalid request.
            fcntl(client, F_SETFL, fcntl(client, F_GETFL, 0) & ~O_NONBLOCK);
            if (!server) { close(client); continue; }
            dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{ [server serve:client]; });
        }
    });
    dispatch_source_set_cancel_handler(_source, ^{ close(fd); });
    dispatch_resume(_source);
    return YES;
}
- (NSString *)fileForPath:(NSString *)path {
    NSString *root = [path hasPrefix:@"/pet/"] || [path hasPrefix:@"/icons/"] ? _assetRoot : _root;
    NSString *file;
    if ([path hasPrefix:@"/pet/petsoc/"]) {
        file = root;
        for (NSString *part in [path componentsSeparatedByString:@"/"]) {
            if (!part.length) continue;
            NSArray *names;
            @synchronized (_listings) {
                names = _listings[file];
                if (!names) { names = [NSFileManager.defaultManager contentsOfDirectoryAtPath:file error:NULL] ?: @[]; _listings[file] = names; }
            }
            NSString *found = [names containsObject:part] ? part : nil;
            if (!found) for (NSString *name in names) if ([name.lowercaseString isEqual:part.lowercaseString]) { found = name; break; }
            file = [file stringByAppendingPathComponent:found ?: part];
        }
    } else file = [root stringByAppendingPathComponent:path];
    file = [[file stringByStandardizingPath] stringByResolvingSymlinksInPath];
    return [file hasPrefix:[root stringByAppendingString:@"/"]] ? file : nil;
}
- (void)serve:(int)fd {
    @autoreleasepool {
        int yes = 1; setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &yes, sizeof(yes));
        struct timeval timeout = {3, 0};
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
        NSMutableData *request = [NSMutableData data];
        char block[2048];
        while (request.length < 16384) {
            ssize_t n = recv(fd, block, sizeof(block), 0);
            if (n <= 0) break;
            [request appendBytes:block length:n];
            NSString *text = [[NSString alloc] initWithData:request encoding:NSUTF8StringEncoding];
            if ([text rangeOfString:@"\r\n\r\n"].location != NSNotFound) break;
        }
        NSString *text = [[NSString alloc] initWithData:request encoding:NSUTF8StringEncoding];
        NSArray *line = [[[text componentsSeparatedByString:@"\r\n"] firstObject] componentsSeparatedByString:@" "];
        BOOL head = line.count >= 2 && [line[0] isEqualToString:@"HEAD"];
        BOOL valid = line.count >= 2 && (head || [line[0] isEqualToString:@"GET"]);
        NSString *url = valid ? [[line[1] componentsSeparatedByString:@"?"] firstObject] : nil;
        NSString *path = [url stringByRemovingPercentEncoding];
        if ([path isEqualToString:@"/"]) path = @"/index.html";
        NSString *file = path ? [self fileForPath:path] : nil;
        valid = valid && [path hasPrefix:@"/"] && file != nil;
        NSData *data = valid ? [NSData dataWithContentsOfFile:file options:NSDataReadingMappedIfSafe error:NULL] : nil;
        int status = data ? 200 : (valid ? 404 : 403);
        if (!data) data = [@"Asset unavailable" dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *mimes = @{@"html":@"text/html; charset=utf-8", @"js":@"text/javascript; charset=utf-8", @"css":@"text/css; charset=utf-8", @"json":@"application/json", @"xml":@"text/xml", @"wasm":@"application/wasm", @"swf":@"application/x-shockwave-flash", @"ttf":@"font/ttf", @"woff":@"font/woff", @"woff2":@"font/woff2", @"png":@"image/png", @"svg":@"image/svg+xml", @"gif":@"image/gif", @"bmp":@"image/bmp", @"jpg":@"image/jpeg", @"jpeg":@"image/jpeg", @"mp3":@"audio/mpeg", @"ogg":@"audio/ogg", @"wav":@"audio/wav", @"mp4":@"video/mp4", @"txt":@"text/plain; charset=utf-8"};
        NSString *mime = mimes[file.pathExtension.lowercaseString] ?: @"application/octet-stream";
        // Match desktop HD semantics: SVG only for image loads, original bytes for Ruffle fetch.
        NSString *lowerRequest = text.lowercaseString;
        if (status == 200 && self.highResolution && [lowerRequest containsString:@"image/svg+xml"] && [@[@"png",@"gif",@"bmp",@"jpg"] containsObject:file.pathExtension.lowercaseString]) {
            NSString *hi = [[file stringByDeletingPathExtension] stringByAppendingString:@"@2x.png"];
            NSData *png = [NSData dataWithContentsOfFile:hi options:NSDataReadingMappedIfSafe error:NULL];
            if (png.length >= 24) {
                const uint8_t *bytes = (const uint8_t *)png.bytes;
                uint32_t width = ((uint32_t)bytes[16]<<24)|((uint32_t)bytes[17]<<16)|((uint32_t)bytes[18]<<8)|bytes[19];
                uint32_t height = ((uint32_t)bytes[20]<<24)|((uint32_t)bytes[21]<<16)|((uint32_t)bytes[22]<<8)|bytes[23];
                NSString *svg = [NSString stringWithFormat:@"<svg xmlns='http://www.w3.org/2000/svg' width='%g' height='%g' viewBox='0 0 %g %g' preserveAspectRatio='none'><image href='data:image/png;base64,%@' width='%g' height='%g' preserveAspectRatio='none'/></svg>",width/2.,height/2.,width/2.,height/2.,[png base64EncodedStringWithOptions:0],width/2.,height/2.];
                data = [svg dataUsingEncoding:NSUTF8StringEncoding]; mime = @"image/svg+xml";
            }
        }
        NSString *headers = [NSString stringWithFormat:@"HTTP/1.1 %d %@\r\nContent-Type: %@\r\nContent-Length: %lu\r\nConnection: close\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\n\r\n", status, status == 200 ? @"OK" : @"Error", mime, (unsigned long)data.length];
        NSData *headerData = [headers dataUsingEncoding:NSUTF8StringEncoding];
        if (QQSend(fd, headerData.bytes, headerData.length) && !head) QQSend(fd, data.bytes, data.length);
        close(fd);
    }
}
- (void)stop {
    if (_source) { dispatch_source_cancel(_source); _source = nil; }
    _port = 0;
}
- (void)dealloc { [self stop]; }
@end
