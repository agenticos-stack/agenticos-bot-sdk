// bot-shell client — the stepper: an ordered flow and its rail.
//
// `goToStep` guards the declared order; the two renderers draw the rail —
// `stepperMarkup` for string-template canvases (the `.stepper` composer the
// campaign canvas's stylesheet draws), `stepperEl` for node-building canvases
// (the `bot-steps` contract in components.css). `.step-dot`/`bot-steps-dot`
// carries the index or a check once done, `aria-current="step"` marks the
// active step, and `data-done` lets the stylesheet finish completed steps.

import { el, esc, icon, iconMarkup } from "./dom.js";

/** `steps` names the order the flow admits — the caller's ids, not this module's. */
export function goToStep(state, step, steps) {
  return !Array.isArray(steps) || steps.includes(step) ? { ...state, step } : state;
}

/** The narrow-viewport pane switch (`source` | `draft` | `preview`-style ids are the caller's vocabulary). */
export function setMobilePane(state, pane, allowed) {
  return !Array.isArray(allowed) || allowed.includes(pane) ? { ...state, mobilePane: pane } : state;
}

/**
 * The rail, as markup. `steps` is a label list (already localized); `active`
 * is the current index. Each step is a button — the canvas's delegated click
 * reads `data-value`; `action`/`keyPrefix` name the action key it listens for.
 */
export function stepperMarkup(steps, active, { action = "step", keyPrefix = "step", label = "Steps" } = {}) {
  return `<nav class="stepper" aria-label="${esc(label)}">${steps
    .map((step, i) => {
      const done = i < active;
      return `<button type="button" class="step" data-action="${esc(action)}" data-value="${i}" data-key="${esc(keyPrefix)}-${i}"${i === active ? ' aria-current="step"' : ""} data-done="${done}">
        <span class="step-dot">${done ? iconMarkup("check") : i + 1}</span><span>${esc(step)}</span>
      </button>${i < steps.length - 1 ? '<span class="step-line" aria-hidden="true"></span>' : ""}`;
    })
    .join("")}</nav>`;
}

/** The node-building twin of `stepperMarkup`; `onStep(i)` wires the delegated handler directly. */
export function stepperEl(steps, active, { onStep, label = "Steps" } = {}) {
  return el("nav", { class: "bot-steps", "aria-label": label }, steps.flatMap((step, i) => {
    const done = i < active;
    const button = el("button", {
      type: "button", class: "bot-steps-step", dataset: { value: i, done: String(done) },
      ...(i === active ? { "aria-current": "step" } : {}),
      onclick: onStep ? () => onStep(i) : undefined
    }, [
      el("span", { class: "bot-steps-dot" }, done ? [icon("check")] : [String(i + 1)]),
      el("span", null, step)
    ]);
    const line = i < steps.length - 1 ? el("span", { class: "bot-steps-line", "aria-hidden": "true" }) : null;
    return line ? [button, line] : [button];
  }));
}
