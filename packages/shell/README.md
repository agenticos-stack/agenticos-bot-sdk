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

# Canvas client modules (0.2.2)

`client/` holds the browser-side half of the shell — the small modules a
gadget canvas bundles into its self-contained `client.js`. Each is imported
per module (`@agenticos-dev/bot-shell/client/dom.js`); there is deliberately
no barrel, so a canvas pays bytes only for the modules it uses.

- `client/rpc.js` — `createRpc(gadget, methods)` wraps the sandbox stub with
  the bot's own method list; `chunkBytes`/`assembleChunkedBlobUrl` reassemble
  chunked facet responses and count what arrived against what was promised.
- `client/dom.js` — the string-template half: `esc()`/`iconSvg()`/
  `preserveRender()` plus the string chrome (`button`, `field`, `notice`,
  `skeleton`) and relative-time labels. The icon vocabulary ships as `ICON_*`
  path constants — `iconSvg(ICON_CHECK)` bundles only the icons a canvas
  draws — with `ICON_PATHS`/`iconMarkup(name)` kept for canvases resolving
  icons dynamically.
- `client/elements.js` — the node-building half: `el()`/`createEl()`/`svgEl()`/
  `icon()`/`replace()`/`skeletonEl()`. `createEl(classMap, decorate)` lets a
  bot keep legacy class names as an adapter onto the `bot-*` contract. The
  split is deliberate: a string canvas never bundles node code and vice versa.
- `client/chrome.css` — the stylesheet the `bot-*` chrome renders against
  (steps rail, toast card, node skeleton). A canvas imports it only when it
  adopts the modules that emit those classes.
- `client/collection.js` — the "watch, notify, act" collection's state layer:
  plain-data reducers for items/filter/search/source chips/selection/notices,
  plus `reviewTabs()`, which projects a definition's `review_state` options
  into filter tabs (open states fold into Drafts) so a new option adds a tab
  with no canvas edit.
- `client/drawer.js` — the dialog/drawer shell: `showDialog`/`closeDialog`/
  `dialogShell` for string canvases, `confirmDrawerChoice` (a promise-based
  choice prompt that survives a stale `close` event) for node canvases.
- `client/steps.js` — `goToStep`/`setMobilePane` guards plus the step rail in
  both render styles (`stepperMarkup` / `stepperEl`).
- `client/toast.js` — `announce()` one-line toasts and `createToaster()` card
  toasts with an action and a dismiss control.

Nothing here fetches, authenticates, or decides policy — the facet owns that;
these modules draw and transmit. `showcase.html` renders each component and
its states when served over http (file:// blocks module imports; the static
contract markup remains as the reference).

## The three component systems

Three systems share one vocabulary by contract, not by code reuse:

1. **Studio `@agenticos/ui`** — Svelte components for the host app. The
   design source of truth for names and geometry.
2. **The design board** (`design-plans/ui-components-board`) — the static
   reference the review loop approves.
3. **This package** — `bot-*` primitives + the `client/` modules, for
   framework-neutral canvases inside a sandboxed `srcdoc` iframe that cannot
   import the host's Svelte components and cannot fetch sibling modules.

A gadget canvas reuses the *contracts* (names, tokens, states, the review_state
projection), never the host's implementations. When a canvas needs a component
that exists only in Studio, the gap is reported back rather than patched
around — that is how this layer stays a library instead of a third fork.
