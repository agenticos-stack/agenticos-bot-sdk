// bot-shell client — the collection's state layer.
//
// The generic "watch, notify, act" collection: items, a filter, a search box,
// a source-chip filter, pagination cursor, selection, a checked-at stamp and
// one dismissible notice. State is plain, immutable-update data — no DOM, no
// RPC — so the whole module is unit-testable in node. The render half is the
// bot's own: a post card, a campaign row and a batch summary are domain views,
// and the package does not draw them.

export function createCollectionState({ filter = "new", items = [] } = {}) {
  return {
    items,
    filter,
    search: "",
    sourceFilter: null,
    nextCursor: null,
    loading: false,
    lastCheckedAt: null,
    // A refusal the collection's own action came back with, rendered above
    // the tray. Generic on purpose: any collection of this shape can have its
    // Continue refused, and the only thing this module knows about one is that
    // it has a message and may offer the caller a single way forward.
    notice: null // { message, actionLabel? } — the caller's handler runs the way forward
  };
}

/** Shows a refusal (or any one-line message) above the tray, with an optional single action. */
export function setNotice(state, notice) {
  if (!notice || typeof notice.message !== "string" || !notice.message) return { ...state, notice: null };
  return {
    ...state,
    notice: { message: notice.message, actionLabel: typeof notice.actionLabel === "string" ? notice.actionLabel : null }
  };
}

export function clearNotice(state) {
  return state.notice ? { ...state, notice: null } : state;
}

/** Replaces (or appends, for pagination) the item list after a fetch. */
export function setItems(state, { items, nextCursor = null, append = false }) {
  return {
    ...state,
    items: append ? state.items.concat(items) : items.slice(),
    nextCursor,
    loading: false
  };
}

export function setLoading(state, loading) {
  return { ...state, loading };
}

/** `allowed` names the filters the collection admits — the caller's vocabulary, not this module's. */
export function setFilter(state, filter, allowed) {
  return !Array.isArray(allowed) || allowed.includes(filter) ? { ...state, filter } : state;
}

export function setSearch(state, search) {
  return { ...state, search: typeof search === "string" ? search : "" };
}

/** Clicking an already-active chip clears the filter — toggle behaviour. */
export function setSourceFilter(state, sourceBinding) {
  return { ...state, sourceFilter: state.sourceFilter === sourceBinding ? null : sourceBinding };
}

/** The checkbox alone changes selection — never coupled to opening a preview. */
export function applySelection(state, id, selected) {
  return { ...state, items: state.items.map((item) => (item.id === id ? { ...item, selected } : item)) };
}

export function clearSelection(state) {
  return { ...state, items: state.items.map((item) => (item.selected ? { ...item, selected: false } : item)) };
}

export function markSeenLocally(state, ids) {
  const seen = new Set(ids);
  return { ...state, items: state.items.map((item) => (seen.has(item.id) ? { ...item, seen: true } : item)) };
}

/**
 * Merges a fresh page of items — typically a refetch after a live event —
 * into the current list, WITHOUT losing an in-flight local selection. The
 * server is authoritative for `selected` at initial load; after that, a
 * `setSelection()` call may be racing ahead of a slower refetch, so an item
 * already known locally keeps its local flag rather than being clobbered back
 * to whatever the incoming snapshot says.
 */
export function mergeScanResult(state, items) {
  const localSelection = new Map(state.items.map((item) => [item.id, item.selected]));
  const merged = items.map((item) =>
    localSelection.has(item.id) ? { ...item, selected: localSelection.get(item.id) } : item
  );
  return { ...state, items: merged, loading: false };
}

export function setLastCheckedAt(state, iso) {
  return { ...state, lastCheckedAt: iso };
}

export function selectedIds(state) {
  return state.items.filter((item) => item.selected).map((item) => item.id);
}

export function selectedCount(state) {
  return state.items.reduce((count, item) => count + (item.selected ? 1 : 0), 0);
}

/** The unseen-items count — independent of the active filter/search. */
export function newCount(state) {
  return state.items.reduce((count, item) => count + (item.seen ? 0 : 1), 0);
}

export function findItem(state, id) {
  return state.items.find((item) => item.id === id) || null;
}

/**
 * The filter/search/chip-narrowed list a card grid actually renders.
 *
 * `unseen` filters the "new" facet; `searchable(item)` returns the text a
 * query matches against — both are the caller's, because what a post, a
 * campaign row or a ticket searches over is the domain's, not the chrome's.
 */
export function visibleItems(state, { unseen = (item) => !item.seen, searchable = (item) => String(item?.text ?? "") } = {}) {
  let items = state.filter === "new" ? state.items.filter(unseen) : state.items;
  if (state.sourceFilter) items = items.filter((item) => item.sourceBinding === state.sourceFilter);
  const query = state.search.trim().toLowerCase();
  if (query) items = items.filter((item) => searchable(item).toLowerCase().includes(query));
  return items;
}

// ---------------------------------------------------------------------------
// Filter tabs derived from a definition's declared options.
//
// The list's tabs read the SAME `review_state` options the definition
// declares, so adding or removing an option changes the tabs with no second
// list to edit — the failure mode behind a shipped `Scheduled`-omission bug.
// `open` names the mutable set (the definition's `mutableWhen.in`); those
// options fold into the one "Draft" tab, and every closed option is its own
// tab. `vocab` maps an option to its `[en, zh]` label, falling back to the
// raw option so a brand-new option still renders.
// ---------------------------------------------------------------------------

export function reviewTabs({ options, open = [], vocab = {}, labels = {} } = {}) {
  if (!Array.isArray(options)) return [];
  const allLabel = labels.all ?? ["All", "全部"];
  const draftLabel = labels.draft ?? ["Drafts", "草稿"];
  const tabs = [{ id: "all", states: null, label: allLabel }];
  const openStates = options.filter((option) => open.includes(option));
  if (openStates.length) tabs.push({ id: "draft", states: openStates, label: draftLabel });
  for (const option of options.filter((entry) => !open.includes(entry))) {
    const entry = vocab[option];
    tabs.push({ id: option, states: [option], label: entry?.label ?? [option.replace(/_/g, " "), option] });
  }
  return tabs;
}
