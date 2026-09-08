import type { Component, Snippet } from "svelte";

export interface GadgetSplitViewProps {
  chat: Snippet;
  canvas: Snippet;
  chatLabel?: string;
  canvasLabel?: string;
  canvasScroll?: "auto" | "clip";
  chatOpen?: boolean;
}

/** Presentation only. Compiling this entry requires a Svelte-capable bundler. */
declare const GadgetSplitView: Component<GadgetSplitViewProps>;
export default GadgetSplitView;
