# Gadget shell: local extraction candidate

`GadgetSplitView.svelte` preserves Studio's bounded app/chat grid, responsive
breakpoint, scroll ownership and permanently mounted app slot. Chat content is
unmounted when collapsed; persistent chat state must remain host-owned.
Pass localized `chatLabel` and `canvasLabel`. Give the parent a definite height.
The shell does not load code, authenticate, grant permissions or run an agent.

Source-preview additions: `chatSide="left"` places conversation first in DOM and
on the desktop left, preserving the existing right-side default. With left chat,
`mobilePane="chat"` or `"canvas"` switches the visible pane below 760px without
unmounting the canvas. `"both"` retains stacked panes. The host owns accessible
panel controls. Set `--bot-chat-width` to a bounded width from the host (for
example 360px); the Social Content preview supplies a labelled native slider.
These additions are not yet published on npm.

This source extraction is local/unpublished, with owner-approved Apache-2.0 licensing.
Studio has not switched to this package. Its mobile visual ordering retains
canvas-first/chat-second behavior. The SDK candidate places canvas first in DOM
and visual order on all screens, with chat on the right on desktop. This differs
from Studio's desktop chat-left arrangement and requires review before adoption.
The published shell entry requires a Svelte-capable bundler; the SDK transport
package remains framework-neutral. No claim of production UI acceptance yet.
# Shared design tokens (unreleased)

## Native component set (unreleased)

Import `tokens.css`, then `components.css`. Use native HTML with `bot-button`,
`bot-input`, `bot-card`/`bot-card-body`, `bot-toolbar`, `bot-field`, `bot-badge`
and `bot-empty`. Primary buttons take `data-variant="primary"`; use actual
`disabled`, associated labels, and `aria-invalid`/`aria-describedby` for errors.
Loading actions need visible text plus `aria-busy`; CSS does not prevent repeat
submissions. Do not use ARIA tabs without implementing their keyboard contract.

Open `showcase.html` alongside both stylesheets for the static reference states.
The set is framework-neutral; it does not inject branding, fetch fonts, manage
data, or install a global reset. The spacing variables use a 4px scale and the
control/card radii match Studio. Override variables, not component internals.

`bot-drawer` styles a native dialog. It fills its **document**, so canvas scoping
requires an iframe document. It is not a generic arbitrary-container overlay.
The host owns chat and navigation; apps own open/close, unsaved edits and focus
restoration. Shared behavioural wrappers and automated browser coverage remain
follow-up work; this first set is a presentation API, not a full widget library.

Import `@agenticos-dev/bot-shell/tokens.css` once in each document, including
iframe canvases. This opt-in, framework-neutral CSS exports the existing
AgenticOS light/dark semantic tokens without resetting elements, fetching fonts,
or requiring Tailwind. Set `data-theme="dark"` on the document element for dark
mode. Hosts own theme propagation to frames; do not accept unvalidated messages.

Use `--font-sans`, `--color-panel`, `--color-paper`, `--color-ink`,
`--color-ink-soft`, `--color-line`, and `--color-act` in application CSS.
Load licensed fonts locally in the host if needed; system fallbacks work offline.
Load host overrides after this stylesheet. Do not duplicate palettes in bots.

Tokens are a versioned snapshot from Studio; provenance is recorded in the CSS.
Future updates must compare upstream values and preserve names as a public API.
This package currently provides tokens and the split shell, not a complete
button/form/dialog library. Prefer native accessible controls until shared
components have tested keyboard, focus, disabled and responsive behavior.
Do not build bespoke modal focus management into each bot.
