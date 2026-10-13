#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>

@interface AXEventPathInfoRepresentation : NSObject
@property (assign, nonatomic) unsigned char pathIdentity;
// Source: nst/iOS-Runtime-Headers, AccessibilityUtilities.framework/AXEventPathInfoRepresentation.h
@property (nonatomic) CGPoint pathLocation;
@property (nonatomic) unsigned char pathProximity;
@property (nonatomic) unsigned int pathEventMask;
@end
