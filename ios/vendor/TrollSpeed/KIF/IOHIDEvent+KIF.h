//
//  IOHIDEvent+KIF.h
//  KIF
//
//  Created by Thomas Bonnin on 7/6/15.
//

#import <Foundation/Foundation.h>
#import "IOKit+SPI.h"

typedef struct __IOHIDEvent * IOHIDEventRef;
@class UITouch;
// Hosts can preserve a nonzero path identity across batch ordering and reset.
// Unset identities retain KIF's original array-index/identity fallback.
void kif_setTouchPathIdentity(UITouch *touch, uint32_t identity);
IOHIDEventRef kif_IOHIDEventWithTouches(NSArray *touches) CF_RETURNS_RETAINED;
