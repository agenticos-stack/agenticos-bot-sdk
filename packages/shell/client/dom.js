// bot-shell client — tiny DOM helpers shared by every canvas view module.
//
// Two render styles live here side by side because both are first-class in
// the canvases that consume them:
//
// - HTML-string templating (esc() + markup builders) — the escaping boundary
//   is `esc()`; every untrusted value goes through it at the render site.
// - DOM-node building (el()/text()/svgEl()) — untrusted content goes through
//   `text()` or a caller-set `textContent`; nothing parses a string as HTML.
//
// A bot picks one style per view; the helpers below never mix them.

export const $ = (q, root = document) => root.querySelector(q);

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Creates an element, applies attrs/props, and appends children (strings
 * become text nodes). `classMap` — supplied via `createEl` — lets a bot keep
 * its legacy class names as a domain-to-design-system adapter while the
 * shared `bot-*` classes do the styling.
 */
export function createEl(classMap = {}) {
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
    for (const child of Array.isArray(children) ? children : children != null ? [children] : []) {
      if (child == null) continue;
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };
}

/** A bare `el` with no class adapter — the default for a fresh canvas. */
export const el = createEl();

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
 * Studio's icon vocabulary, drawn with Studio's geometry.
 *
 * Studio itself keeps two implementations of one set: `StudioIcon.svelte`
 * maps names onto Hugeicons, and `agenticos-ui/Icon.svelte` draws the same
 * names by hand for surfaces that cannot take the dependency. A gadget canvas
 * is that second case twice over — vanilla DOM in a sandboxed iframe inside a
 * self-contained flat archive — so the path data below tracks `Icon.svelte`
 * rather than being re-drawn. Same names, same 24 grid, same round stroke, so
 * a gadget's chrome cannot drift away from the app that hosts it. Add a name
 * here only when Studio already has it.
 *
 * Each entry is an array of `d` path strings.
 */
export const ICON_PATHS = {
  mail: ["M3 5h18v14H3z", "M3 6l9 7 9-7"],
  grid: ["M3 3h7v7H3z", "M14 3h7v7H3z", "M3 14h7v7H3z", "M14 14h7v7H3z"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M16 3a4 4 0 0 1 0 8", "M22 21v-2a4 4 0 0 0-3-3.87", "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0"],
  chart: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20V7"],
  file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M8 13h8", "M8 17h6"],
  calendar: ["M4 5h16v16H4z", "M16 3v4", "M8 3v4", "M4 11h16"],
  settings: [
    "M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z",
    "M19.4 13.5a7.7 7.7 0 0 0 .05-3l2-1.55-2-3.45-2.45 1a8 8 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A8 8 0 0 0 7 6.5l-2.45-1-2 3.45 2 1.55a7.7 7.7 0 0 0 .05 3l-2.05 1.55 2 3.45L7 17.5a8 8 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a8 8 0 0 0 2.6-1.5l2.45 1 2-3.45-2.05-1.55Z"
  ],
  chev: ["M9 5l7 7-7 7"],
  down: ["M6 9l6 6 6-6"],
  back: ["M19 12H5", "M11 6l-6 6 6 6"],
  plus: ["M12 5v14", "M5 12h14"],
  search: ["M21 21l-5-5", "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0"],
  check: ["M4 12l5 5L20 6"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  clock: ["M12 8v5l3 2", "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0"],
  shield: ["M12 3l8 4v6c0 5-8 9-8 9s-8-4-8-9V7z", "M8 12l3 3 5-6"],
  info: ["M12 11v6", "M12 7h.01", "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0"],
  spark: ["M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"],
  monitor: ["M3 3h18v14H3z", "M8 21h8", "M12 17v4"],
  phone: ["M7 2h10v20H7z", "M11 18h2"],
  "text-lines": ["M4 5h16", "M4 10h16", "M4 15h16", "M4 20h10"],
  heading: ["M5 4v16", "M19 4v16", "M5 12h14"],
  image: ["M3 3h18v18H3z", "M3 17l6-6 4 4 3-3 5 5", "M8 7h.01"],
  link: ["M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2", "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"],
  up: ["M6 15l6-6 6 6"],
  trash: ["M3 6h18", "M8 6V3h8v3", "M5 6l1 15h12l1-15", "M10 10v7", "M14 10v7"],
  refresh: [
    "M20 6v5h-5",
    "M4 18v-5h5",
    "M18.2 10.5A6.6 6.6 0 0 0 6.6 7.2L4 9.7",
    "M5.8 13.5a6.6 6.6 0 0 0 11.6 3.3L20 14.3"
  ],
  send: ["M22 2L9 15", "M22 2l-7 20-6-7-7-6z"],
  undo: ["M9 5L4 10l5 5", "M4 10h10a6 6 0 0 1 0 12"],
  plug: ["M9 2v6", "M15 2v6", "M7 8h10v4a5 5 0 0 1-10 0z", "M12 17v5"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  door: ["M15 3h4v18h-4", "M10 17l5-5-5-5", "M15 12H3"],
  chat: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  eye: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6"],
  code: ["M8 6l-6 6 6 6", "M16 6l6 6-6 6"],
  dots: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  copy: ["M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
  alert: ["M12 8v5", "M12 17h.01", "M10.3 3.8L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"]
};

/**
 * One named icon as an SVG element, sized and coloured by CSS.
 *
 * Built as nodes rather than injected as markup, so an icon stays subject to
 * the same no-innerHTML rule as everything else in this module. Decorative by
 * construction: every icon button carries its own `aria-label`.
 */
export function icon(name) {
  const paths = ICON_PATHS[name];
  if (!paths) throw new Error(`Unknown icon: ${name}`);
  return svgEl("svg", {
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.8,
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false"
  }, paths.map((d) => svgEl("path", { d })));
}

/**
 * The same icon as an HTML string for string-template canvases. The host
 * canvas's stylesheet carries the stroke/fill rules (`svg { stroke:
 * currentColor; fill: none; … }`), so the markup stays bare.
 */
export function iconMarkup(name, cls = "") {
  const paths = ICON_PATHS[name];
  if (!paths) throw new Error(`Unknown icon: ${name}`);
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
}

/** Clears a container and appends fresh children in one step. */
export function replace(container, children) {
  container.replaceChildren(...(Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean)));
  return container;
}

const RELATIVE_UNITS = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000]
];

const RELATIVE_UNITS_ZH = { year: "年", month: "個月", week: "星期", day: "日", hour: "小時", minute: "分鐘" };

/**
 * "3 days ago" / "3 日前", from one place.
 *
 * A coarse "N units ago" without pulling in Intl.RelativeTimeFormat data the
 * sandbox may not ship a locale for. Falls back to "just now" under a
 * minute — good enough for "Checked 2 min ago" / a card's timestamp.
 */
export function relativeLabel(locale, iso, now = Date.now()) {
  const rel = relativeTimeFrom(iso, now);
  if (!rel) return null;
  if (rel.amount === 0) return locale === "zh-HK" ? "剛剛" : "just now";
  if (locale === "zh-HK") return `${rel.amount} ${RELATIVE_UNITS_ZH[rel.unit]}前`;
  return `${rel.amount} ${rel.unit}${rel.amount === 1 ? "" : "s"} ago`;
}

export function relativeTimeFrom(iso, now = Date.now()) {
  if (typeof iso !== "string" || !iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const diff = Math.max(0, now - then);
  for (const [unit, ms] of RELATIVE_UNITS) {
    const amount = Math.floor(diff / ms);
    if (amount >= 1) return { unit, amount };
  }
  return { unit: "minute", amount: 0 };
}

/**
 * Re-render without losing the focused control, its text selection, or the
 * scroll position — the render contract for string-template canvases.
 */
export function preserveRender(root, html) {
  const active = document.activeElement;
  const key = active?.dataset?.key;
  let selection = null;
  try {
    if (active?.selectionStart != null) selection = [active.selectionStart, active.selectionEnd];
  } catch {}
  const cv = root.querySelector(".canvas") ?? root;
  const sc = cv.scrollTop ?? 0;
  root.innerHTML = html;
  const ncv = root.querySelector(".canvas") ?? root;
  ncv.scrollTop = sc;
  if (key) {
    const target = root.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (target && !target.disabled) {
      target.focus({ preventScroll: true });
      if (selection) try { target.setSelectionRange(...selection); } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// String-template chrome — the markup counterparts of the node builders.
// ---------------------------------------------------------------------------

/**
 * A stable-labelled button — `stableLabel`, when given, reserves the label's
 * width while the text swaps to a busy state, so a button does not jump as it
 * becomes busy.
 */
export function button(action, label, { kind = "", ic = "", key = action, value = "", disabled = false, stableLabel = "", extra = "" } = {}) {
  const text = stableLabel
    ? `<span class="busy-label"><span class="measure" aria-hidden="true">${stableLabel}</span><span>${label}</span></span>`
    : `<span>${label}</span>`;
  return `<button type="button" class="btn ${kind}" data-action="${action}" data-key="${esc(key)}"${value !== "" ? ` data-value="${esc(value)}"` : ""} ${disabled ? 'aria-disabled="true"' : ""} ${extra}>${ic ? iconMarkup(ic) : ""}${text}</button>`;
}

export function field(key, label, value, { type = "text", hint = "", placeholder = "", disabled = false, required = false } = {}) {
  return `<div class="field"><label class="field-label" for="${key}">${label}${required ? '<span class="req">*</span>' : ""}</label><input id="${key}" class="field-control" data-field="${key}" data-key="${key}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${disabled ? "disabled" : ""}${required ? " required" : ""}>${hint ? `<p id="${key}-hint" class="field-hint">${hint}</p>` : ""}</div>`;
}

export function notice(title, body = "", kind = "", action = "") {
  return `<div class="notice ${kind}" role="${kind === "error" ? "alert" : "status"}">${iconMarkup(kind === "success" ? "check" : "info")}<div class="grow"><strong>${title}</strong>${body ? `<p>${body}</p>` : ""}</div>${action ? `<div class="notice-actions">${action}</div>` : ""}</div>`;
}

/**
 * A geometry-holding loading placeholder — the skeleton. `height` keeps the
 * layout of the view it stands in for, so data arriving never moves the
 * canvas. `bot-skeleton` is styled by components.css; `skeleton` names the
 * canvas-level hook some stylesheets already draw.
 */
export function skeleton(height, { width = "100%", cls = "" } = {}) {
  return `<div class="${`skeleton bot-skeleton ${cls}`.trim()}" style="height:${Number(height) || 16}px;width:${esc(width)}" aria-hidden="true"></div>`;
}

/** The node-building twin of `skeleton`. */
export function skeletonEl(height, { width = "100%", cls = "" } = {}) {
  return el("div", { class: `bot-skeleton ${cls}`.trim(), style: `height:${Number(height) || 16}px;width:${width}`, "aria-hidden": "true" });
}
