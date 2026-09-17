// bot-shell client — the toast: a transient status the canvas announces and
// dismisses. Two surfaces of one component:
//
// - `announce` — a one-line text toast into a fixed host region (the
//   `.bot-toast` / `.show` contract in components.css).
// - `createToaster` — a card toast with title, body, an optional action, and
//   a dismiss control (the `.bot-toast-card` contract), for canvases whose
//   notices carry a way forward.

import { el, replace } from "./elements.js";

/**
 * Shows `message` in the toast host for `duration` ms. The host is any region
 * the canvas designated (`role="status"`/`aria-live` so screen readers hear
 * it); the `.show` class is the stylesheet's show/hide hook.
 */
export function announce(message, { target = "#toast", duration = 3500 } = {}) {
  const host = typeof target === "string" ? document.querySelector(target) : target;
  if (!host) return;
  host.textContent = message;
  host.classList.add("show");
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => host.classList.remove("show"), duration);
}

/**
 * A card toaster bound to a host region. `show({ title, body, action })`
 * renders the card; `action` is `{ label, run }`; `dismissLabel` is the
 * localized aria-label for the dismiss control. `clear()` empties the region.
 * Long enough to read a refusal, and it can be dismissed sooner — a notice
 * that vanishes before it is read is the same as no notice.
 */
export function createToaster(region, { duration = 12000, dismissLabel = "Dismiss", onLog } = {}) {
  let timer = null;
  function clear() {
    if (timer) clearTimeout(timer);
    timer = null;
    replace(region, []);
  }
  function show({ title, body, action } = {}) {
    onLog?.(title, body);
    if (timer) clearTimeout(timer);
    replace(region, [
      el("div", { class: "bot-toast-card" }, [
        el("strong", null, title),
        body ? el("span", null, body) : null,
        action
          ? el("button", { type: "button", class: "bot-toast-action", onclick: () => { clear(); action.run(); } }, action.label)
          : null,
        el("button", {
          type: "button", class: "bot-toast-dismiss",
          "aria-label": dismissLabel, onclick: () => clear()
        }, "×")
      ])
    ]);
    timer = setTimeout(() => clear(), duration);
  }
  return { show, clear };
}
