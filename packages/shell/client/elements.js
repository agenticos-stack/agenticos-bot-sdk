// bot-shell client — the node-building half of the DOM layer.
//
// The second render style canvases use: createElement trees rather than HTML
// strings, so untrusted content goes through `text()` or a caller-set
// `textContent` and nothing parses a string as HTML. The string-template
// half (`esc`, `iconMarkup`, `preserveRender`, the chrome helpers) lives in
// `dom.js` — a node-building canvas never pays for it.

import { ICON_PATHS } from "./dom.js";

/**
 * Creates an element, applies attrs/props, and appends children (strings
 * become text nodes). `classMap` lets a bot keep its legacy class names as a
 * domain-to-design-system adapter while the shared `bot-*` classes do the
 * styling; `decorate(node)` is the bot's own post-pass (a class-to-attribute
 * mapping, say) — kept bot-side so the adapter never leaks domain names.
 */
export function createEl(classMap = {}, decorate) {
  return function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "value" && tag === "textarea") node.value = String(value);
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
        else if (value === true) node.setAttribute(key, "");
        else node.setAttribute(key, String(value));
      }
    }
    for (const name of [...node.classList]) {
      if (classMap[name]) node.classList.add(classMap[name]);
    }
    decorate?.(node);
    for (const child of Array.isArray(children) ? children : children != null ? [children] : []) {
      if (child == null) continue;
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };
}

let bareEl;
/** A bare `el` with no class adapter — the default for a fresh canvas. Lazily
 * built so a module that only imports `svgEl`/`replace` carries no extra init. */
export function el(tag, attrs, children) {
  return (bareEl ??= createEl())(tag, attrs, children);
}

/** A bare text node — for call sites that want to skip the `el()` ceremony. */
export function text(value) {
  return document.createTextNode(String(value ?? ""));
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** `el()` for the SVG namespace, which `createElement` cannot produce. */
export function svgEl(tag, attrs, children) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of Array.isArray(children) ? children : children != null ? [children] : []) {
    if (child instanceof Node) node.appendChild(child);
  }
  return node;
}

/**
 * One named icon as an SVG element, sized and coloured by CSS — the node-side
 * twin of `iconMarkup` in dom.js, built from the same ICON_PATHS table.
 * Decorative by construction: every icon button carries its own `aria-label`.
 */
export function icon(name) {
  const d = ICON_PATHS[name];
  if (!d) throw new Error(`Unknown icon: ${name}`);
  return svgEl("svg", {
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.8,
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false"
  }, [svgEl("path", { d })]);
}

/** Clears a container and appends fresh children in one step. */
export function replace(container, children) {
  container.replaceChildren(...(Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean)));
  return container;
}

/** The node-building twin of `dom.js`'s `skeleton` — the components.css `bot-skeleton` contract. */
export function skeletonEl(height, { width = "100%", cls = "" } = {}) {
  return el("div", { class: `bot-skeleton ${cls}`.trim(), style: `height:${Number(height) || 16}px;width:${width}`, "aria-hidden": "true" });
}
