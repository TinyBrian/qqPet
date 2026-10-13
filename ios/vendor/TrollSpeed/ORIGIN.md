# Vendored source

Source: https://github.com/Lessica/TrollSpeed
Revision: a609be260c8261ead36509c3bc4ded8479da9c40
License: MIT (LICENSE), with the original KIF copyright comments retained.

The private headers and KIF touch helpers are vendored, so builds do not fetch these dependencies. QPEventBridge.m derives its touch delivery and UIApplication event setup from sources/TSEventFetcher.mm, sources/HUDMainApplication.mm and sources/HUDApp.mm at this revision. It retains touch identities across movements, converts global coordinates for a cropped window, checks private-selector availability, and retains the bounded read-only dispatcher matcher described below. Trailing whitespace was removed from the copied files.

KIF adaptation: initTouch does not index connectedScenes before a HUD window exists. It constructs an ended, unattached touch; actual touches use initAtPoint:inWindow:onView:.

When the private dispatcher selector is unavailable, the pinned
HUDMainApplication.mm read-only instruction fallback checks the call-site and
target instruction signatures and requires the target to be in the same loaded
image before invocation. No code is patched.

KIF notice: KIF/LICENSE is the upstream KIF Apache 2.0 license, retained for files carrying Square contributor notices. The KIF private category header additionally exposes the existing kif_setHidEvent method so synthetic move/end events refresh their attached HID representation.

Private C exports resolve dynamically from their existing declarations. AX per-path getters are declared from RuntimeBrowser-generated metadata at https://github.com/nst/iOS-Runtime-Headers/blob/master/PrivateFrameworks/AccessibilityUtilities.framework/AXEventPathInfoRepresentation.h and guarded at runtime. The iOS 14 UIKit dispatcher fallback uses the bounded call-site matcher from the pinned TrollSpeed source.

The added `GSEventRun` declaration follows https://github.com/theos/headers/blob/master/GraphicsServices/GSEvent.h. The no-argument `GSEventInitializeAsExtension` ABI is derived from the Darwin 20 GraphicsServices export: it initializes the event run loop without registering a legacy Purple application port. The HUD uses that extension initialization and a mode-aware event loop so scroll gestures can enter and leave tracking mode; newer runtimes without the extension export retain the normal initializer.

Outside-touch monitoring uses dynamically resolved IOHIDEventSystemClient C callback/scheduling signatures as declared by https://github.com/witchan/ios-mcp/blob/main/IOHIDPrivate.h. Digitizer field identifiers follow Apple IOHIDFamily-1446.140.2 IOHIDEventTypes.h and IOHIDEventFieldDefs.h (Darwin 20). No event is filtered or re-dispatched by this observer.
