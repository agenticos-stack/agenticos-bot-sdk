# Gadget shell: local extraction candidate

`GadgetSplitView.svelte` preserves Studio's bounded app/chat grid, responsive
breakpoint, scroll ownership and permanently mounted app slot. Chat content is
unmounted when collapsed; persistent chat state must remain host-owned.
Pass localized `chatLabel` and `canvasLabel`. Give the parent a definite height.
The shell does not load code, authenticate, grant permissions or run an agent.

This source extraction is local/unpublished pending license/provenance review.
Studio has not switched to this package. Its mobile visual ordering retains
canvas-first/chat-second behavior. The SDK candidate places canvas first in DOM
and visual order on all screens, with chat on the right on desktop. This differs
from Studio's desktop chat-left arrangement and requires review before adoption.
The published shell entry requires a Svelte-capable bundler; the SDK transport
package remains framework-neutral. No claim of production UI acceptance yet.
