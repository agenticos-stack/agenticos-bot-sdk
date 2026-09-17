// bot-shell client — the dialog/drawer shell.
//
// One `<dialog>` element hosts both surfaces: a centered confirm (`dialogShell`
// / `confirmDrawerChoice`) and a right-docked sheet (`drawer: true`, the
// `dialog.bot-drawer` contract in components.css). Native `showModal()` gives
// the canvas its top layer, backdrop and Escape semantics for free — no
// overlay machinery is re-implemented here.

import { el, replace } from "./elements.js";
import { esc, iconSvg, ICON_CLOSE } from "./dom.js";

/**
 * Mounts markup into the shared dialog — `#dialog` is the canvas contract;
 * the canvas creates the element once and re-mounts it. `drawer` swaps the
 * centered panel for the right-docked sheet geometry (the `dialog.bot-drawer`
 * contract); the first focusable (or `[data-autofocus]`) control takes focus.
 */
export function showDialog(html, { drawer = false } = {}) {
  const dlg = document.querySelector("#dialog");
  if (!dlg) return;
  dlg.className = drawer ? "bot-drawer" : "";
  dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
  const first = dlg.querySelector("[data-autofocus]") || dlg.querySelector("button,input,select,textarea");
  first?.focus();
}

export function closeDialog() {
  const dlg = document.querySelector("#dialog");
  if (dlg?.open) dlg.close();
  if (dlg) dlg.innerHTML = "";
}

/**
 * The string-template shell: head (title + optional description + dismiss),
 * scrollable body, optional footer actions. `closeLabel` is the localized
 * aria-label for the dismiss button — the canvas supplies it; the package
 * carries no copy.
 */
export function dialogShell(title, desc, body, foot, { drawer = false, closeLabel = "Close" } = {}) {
  showDialog(
    `<div class="dialog-head"><div class="grow"><h2 id="dialog-title">${title}</h2>${desc ? `<p>${desc}</p>` : ""}</div><button class="btn quiet icon" data-action="close-dialog" data-key="dlg-close" aria-label="${esc(closeLabel)}">${iconSvg(ICON_CLOSE)}</button></div><div class="dialog-body">${body}</div>${foot ? `<div class="dialog-footer">${foot}</div>` : ""}`,
    { drawer }
  );
}

const pendingChoices = new WeakMap();

/**
 * A promise-based choice prompt on a `<dialog>` — the node's version of the
 * shell, for canvases building DOM. Resolves with the chosen `value`, or
 * `"cancel"` when the dialog is dismissed. A second call while one is open
 * returns the in-flight decision rather than stacking a prompt.
 *
 * The `close` event is dispatched as a later task, after `close()` returns.
 * When one prompt resolves and the caller opens the next on the same dialog
 * straight away, the first prompt's close arrives while the dialog is open
 * again — only a close that left the dialog closed is a real dismissal.
 */
export function confirmDrawerChoice(dialog, { title, body, choices }) {
  const pending = pendingChoices.get(dialog);
  if (pending) return pending;
  let settle;
  const decision = new Promise((resolve) => { settle = resolve; });
  pendingChoices.set(dialog, decision);
  let done = false;
  const finish = (value) => {
    if (done) return;
    done = true;
    dialog.removeEventListener("cancel", onCancel);
    dialog.removeEventListener("close", onClose);
    pendingChoices.delete(dialog);
    if (dialog.open) dialog.close();
    settle(value);
  };
  const onCancel = (event) => { event.preventDefault?.(); finish("cancel"); };
  const onClose = () => { if (dialog.open) return; finish("cancel"); };
  replace(dialog, [
    el("div", { class: "bot-drawer-sheet" }, [
      el("header", { class: "bot-drawer-head" }, [el("strong", null, title)]),
      el("div", { class: "bot-drawer-body" }, (Array.isArray(body) ? body : [body]).filter(Boolean).map((line) => el("p", null, line))),
      el("footer", { class: "bot-drawer-actions" }, choices.map((choice) =>
        el("button", { type: "button", class: "bot-button", dataset: { choice: choice.value, ...(choice.primary ? { variant: "primary" } : {}) }, onclick: () => finish(choice.value) }, choice.label)))
    ])
  ]);
  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("close", onClose);
  if (!dialog.open) dialog.showModal();
  return decision;
}
