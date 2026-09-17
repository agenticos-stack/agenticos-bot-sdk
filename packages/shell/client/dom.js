// bot-shell client — the string-template half of the DOM layer.
//
// HTML-string templating is one of the two render styles canvases use; this
// module is its escaping boundary. Every untrusted value goes through `esc()`
// at the render site — no markup reaches a document unescaped. The node
// builders (`el`, `svgEl`, `replace`, `icon`) live in `elements.js` — a
// string-template canvas never pays for them.
//
// The chrome helpers (`button`, `field`, `notice`, `skeleton`) emit the
// canvas's own class contract — `.btn`, `.field`, `.notice`, `.skeleton` are
// styled by the consuming stylesheet, not by components.css.

export const $ = (q, root = document) => root.querySelector(q);

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
 * Each entry is one `d` attribute — a path element can carry multiple
 * subpaths (`M…Z M…Z`), so multi-stroke icons join their parts with a space.
 *
 * Every icon is also its own `ICON_*` export: a canvas that passes the path
 * constants around (`iconSvg(ICON_CHECK)`, a button's `ic:` option) bundles
 * only the icons it draws. `ICON_PATHS` stays the name→path table for
 * canvases resolving icons dynamically — importing it (or `iconMarkup`)
 * keeps the whole vocabulary.
 */
export const ICON_MAIL = "M3 5h18v14H3z M3 6l9 7 9-7";
export const ICON_GRID = "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z";
export const ICON_USERS = "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0";
export const ICON_CHART = "M4 20V10 M10 20V4 M16 20v-7 M22 20V7";
export const ICON_FILE = "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h6";
export const ICON_CALENDAR = "M4 5h16v16H4z M16 3v4 M8 3v4 M4 11h16";
export const ICON_SETTINGS = "M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z M19.4 13.5a7.7 7.7 0 0 0 .05-3l2-1.55-2-3.45-2.45 1a8 8 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A8 8 0 0 0 7 6.5l-2.45-1-2 3.45 2 1.55a7.7 7.7 0 0 0 .05 3l-2.05 1.55 2 3.45L7 17.5a8 8 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a8 8 0 0 0 2.6-1.5l2.45 1 2-3.45-2.05-1.55Z";
export const ICON_CHEV = "M9 5l7 7-7 7";
export const ICON_DOWN = "M6 9l6 6 6-6";
export const ICON_BACK = "M19 12H5 M11 6l-6 6 6 6";
export const ICON_PLUS = "M12 5v14 M5 12h14";
export const ICON_SEARCH = "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0";
export const ICON_CHECK = "M4 12l5 5L20 6";
export const ICON_CLOSE = "M6 6l12 12 M18 6L6 18";
export const ICON_CLOCK = "M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0";
export const ICON_SHIELD = "M12 3l8 4v6c0 5-8 9-8 9s-8-4-8-9V7z M8 12l3 3 5-6";
export const ICON_INFO = "M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0";
export const ICON_SPARK = "M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z";
export const ICON_MONITOR = "M3 3h18v14H3z M8 21h8 M12 17v4";
export const ICON_PHONE = "M7 2h10v20H7z M11 18h2";
export const ICON_TEXT = "M4 5h16 M4 10h16 M4 15h16 M4 20h10";
export const ICON_HEADING = "M5 4v16 M19 4v16 M5 12h14";
export const ICON_IMAGE = "M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M8 7h.01";
export const ICON_LINK = "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2";
export const ICON_UP = "M6 15l6-6 6 6";
export const ICON_TRASH = "M3 6h18 M8 6V3h8v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7";
export const ICON_REFRESH = "M20 6v5h-5 M4 18v-5h5 M18.2 10.5A6.6 6.6 0 0 0 6.6 7.2L4 9.7 M5.8 13.5a6.6 6.6 0 0 0 11.6 3.3L20 14.3";
export const ICON_SEND = "M22 2L9 15 M22 2l-7 20-6-7-7-6z";
export const ICON_UNDO = "M9 5L4 10l5 5 M4 10h10a6 6 0 0 1 0 12";
export const ICON_PLUG = "M9 2v6 M15 2v6 M7 8h10v4a5 5 0 0 1-10 0z M12 17v5";
export const ICON_BELL = "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0";
export const ICON_DOOR = "M15 3h4v18h-4 M10 17l5-5-5-5 M15 12H3";
export const ICON_CHAT = "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z";
export const ICON_EYE = "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6";
export const ICON_CODE = "M8 6l-6 6 6 6 M16 6l6 6-6 6";
export const ICON_DOTS = "M5 12h.01 M12 12h.01 M19 12h.01";
export const ICON_COPY = "M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2 M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1";
export const ICON_ALERT = "M12 8v5 M12 17h.01 M10.3 3.8L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z";

export const ICON_PATHS = {
  mail: ICON_MAIL,
  grid: ICON_GRID,
  users: ICON_USERS,
  chart: ICON_CHART,
  file: ICON_FILE,
  calendar: ICON_CALENDAR,
  settings: ICON_SETTINGS,
  chev: ICON_CHEV,
  down: ICON_DOWN,
  back: ICON_BACK,
  plus: ICON_PLUS,
  search: ICON_SEARCH,
  check: ICON_CHECK,
  close: ICON_CLOSE,
  clock: ICON_CLOCK,
  shield: ICON_SHIELD,
  info: ICON_INFO,
  spark: ICON_SPARK,
  monitor: ICON_MONITOR,
  phone: ICON_PHONE,
  text: ICON_TEXT,
  heading: ICON_HEADING,
  image: ICON_IMAGE,
  link: ICON_LINK,
  up: ICON_UP,
  trash: ICON_TRASH,
  refresh: ICON_REFRESH,
  send: ICON_SEND,
  undo: ICON_UNDO,
  plug: ICON_PLUG,
  bell: ICON_BELL,
  door: ICON_DOOR,
  chat: ICON_CHAT,
  eye: ICON_EYE,
  code: ICON_CODE,
  dots: ICON_DOTS,
  copy: ICON_COPY,
  alert: ICON_ALERT
};

/**
 * One named icon as an HTML string for string-template canvases. The host
 * canvas's stylesheet carries the stroke/fill rules (`svg { stroke:
 * currentColor; fill: none; … }`), so the markup stays bare.
 */
export function iconSvg(d, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
}

/** Name lookup for canvases resolving icons from data (`icon(name)`). */
export function iconMarkup(name, cls = "") {
  const d = ICON_PATHS[name];
  if (!d) throw new Error(`Unknown icon: ${name}`);
  return iconSvg(d, cls);
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
  return `<button type="button" class="btn ${kind}" data-action="${action}" data-key="${esc(key)}"${value !== "" ? ` data-value="${esc(value)}"` : ""} ${disabled ? 'aria-disabled="true"' : ""} ${extra}>${ic ? iconSvg(ic) : ""}${text}</button>`;
}

export function field(key, label, value, { type = "text", hint = "", placeholder = "", disabled = false, required = false } = {}) {
  return `<div class="field"><label class="field-label" for="${key}">${label}${required ? '<span class="req">*</span>' : ""}</label><input id="${key}" class="field-control" data-field="${key}" data-key="${key}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${disabled ? "disabled" : ""}${required ? " required" : ""}>${hint ? `<p id="${key}-hint" class="field-hint">${hint}</p>` : ""}</div>`;
}

export function notice(title, body = "", kind = "", action = "") {
  return `<div class="notice ${kind}" role="${kind === "error" ? "alert" : "status"}">${iconSvg(kind === "success" ? ICON_CHECK : ICON_INFO)}<div class="grow"><strong>${title}</strong>${body ? `<p>${body}</p>` : ""}</div>${action ? `<div class="notice-actions">${action}</div>` : ""}</div>`;
}

/**
 * A geometry-holding loading placeholder — the skeleton. `height` keeps the
 * layout of the view it stands in for, so data arriving never moves the
 * canvas. Emits the canvas-level `skeleton` hook the consuming stylesheet
 * draws (`bot-skeleton` is the node-side components.css contract).
 */
export function skeleton(height, { width = "100%", cls = "" } = {}) {
  return `<div class="${`skeleton ${cls}`.trim()}" style="height:${Number(height) || 16}px;width:${esc(width)}" aria-hidden="true"></div>`;
}
