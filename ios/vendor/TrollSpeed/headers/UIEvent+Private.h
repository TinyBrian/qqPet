//
//  UIEvent+Private.h
//  FakeTouch
//
//  Created by Watanabe Toshinori on 2/6/19.
//  Copyright © 2019 Watanabe Toshinori. All rights reserved.
//

#import <UIKit/UIKit.h>
#import "IOKit+SPI.h"

@interface UIEvent (Private)
- (void)_addTouch:(UITouch *)touch forDelayedDelivery:(BOOL)delayed;
- (void)_clearTouches;
// RuntimeBrowser UIKitCore/UITouchesEvent.h: standalone hosts may have no app event.
- (instancetype)_init;
// KIF afa52b5e56ee6e91c5c4b3bae1ccacebe46a8b47, UIEvent+KIFAdditions.m.
- (void)_setHIDEvent:(IOHIDEventRef)event;
@end