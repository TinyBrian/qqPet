# Vendored source

Source: https://github.com/Lessica/TrollSpeed
Revision: a609be260c8261ead36509c3bc4ded8479da9c40
License: MIT (LICENSE), with the original KIF copyright comments retained.

The private headers and KIF touch helpers are vendored, so builds do not fetch these dependencies. QPEventBridge.m derives its touch delivery and UIApplication event setup from sources/TSEventFetcher.mm, sources/HUDMainApplication.mm and sources/HUDApp.mm at this revision. It retains touch identities across movements, converts global coordinates for a cropped window, checks private-selector availability, and retains the bounded read-only dispatcher matcher described below. Trailing whitespace was removed from the copied files.

KIF adaptation: initTouch does not index connectedScenes before a HUD window exists. It constructs an ended, unattached touch; actual touches use initAtPoint:inWindow:onView:. The active touch initializer restores tapCount and the guarded first-touch flag from official KIF revision afa52b5e56ee6e91c5c4b3bae1ccacebe46a8b47. QPEventBridge also follows that revision's UIEvent+KIFAdditions.m to attach the complete hand HID payload to each UIEvent.

A standalone UIKit host may have no UIApplication-owned touches event. In that case QPEventBridge creates and retains UITouchesEvent through its guarded `_init` method; the no-argument object-returning ABI follows https://github.com/nst/iOS-Runtime-Headers/blob/master/PrivateFrameworks/UIKitCore.framework/UITouchesEvent.h. Delivery uses a common-mode run-loop source and preserves each HID packet and touch phase until the next packet. Captured AX path identities remain attached to each touch across HID batch ordering and cancellation; range-only paths end independently from other held fingers.

When the private dispatcher selector is unavailable, the pinned
HUDMainApplication.mm read-only instruction fallback checks the call-site and
target instruction signatures and requires the target to be in the same loaded
image before invocation. No code is patched.

KIF notice: KIF/LICENSE is the upstream KIF Apache 2.0 license, retained for files carrying Square contributor notices. The KIF private category header additionally exposes the existing kif_setHidEvent method so synthetic move/end events refresh their attached HID representation.

Private C exports resolve dynamically from their existing declarations. AX per-path getters are declared from RuntimeBrowser-generated metadata at https://github.com/nst/iOS-Runtime-Headers/blob/master/PrivateFrameworks/AccessibilityUtilities.framework/AXEventPathInfoRepresentation.h and guarded at runtime. The iOS 14 UIKit dispatcher fallback uses the bounded call-site matcher from the pinned TrollSpeed source.

The added `GSEventRun` declaration follows https://github.com/theos/headers/blob/master/GraphicsServices/GSEvent.h. The no-argument `GSEventInitializeAsExtension` ABI is derived from the Darwin 20 GraphicsServices export: it initializes the event run loop without registering a legacy Purple application port. The HUD uses extension initialization on iOS 14 and the normal initializer on iOS 15+, matching the pinned HUD startup path. Its mode-aware event loop lets scroll gestures enter and leave tracking mode.

Outside-touch monitoring uses dynamically resolved IOHIDEventSystemClient C callback/scheduling signatures as declared by https://github.com/witchan/ios-mcp/blob/main/IOHIDPrivate.h. Digitizer field identifiers follow Apple IOHIDFamily-1446.140.2 IOHIDEventTypes.h and IOHIDEventFieldDefs.h (Darwin 20). No event is filtered or re-dispatched by this observer.
