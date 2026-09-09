<script lang="ts">
  import type { Snippet } from "svelte";

  // Presentation extracted from Studio's GadgetSplitView; no host authority.
  // Labels are supplied by the host's locale, not imported from Studio.
  let {
    chat, canvas, chatLabel = "Conversation", canvasLabel = "App",
    canvasScroll = "auto", chatOpen = true, chatSide = "right", mobilePane = "both"
  } = $props<{
    chat: Snippet;
    canvas: Snippet;
    chatLabel?: string;
    canvasLabel?: string;
    canvasScroll?: "auto" | "clip";
    chatOpen?: boolean;
    chatSide?: "left" | "right";
    mobilePane?: "chat" | "canvas" | "both";
  }>();
</script>

<div class="split" class:chat-open={chatOpen} class:chat-left={chatSide === "left"} data-mobile-pane={mobilePane}>
  {#if chatSide === "left"}
    <section class="chat" aria-label={chatLabel} hidden={!chatOpen}>
      {#if chatOpen}{@render chat()}{/if}
    </section>
  {/if}
  <section class="canvas" class:canvas-clip={canvasScroll === "clip"} aria-label={canvasLabel}>
    {@render canvas()}
  </section>
  {#if chatSide === "right"}<section class="chat" aria-label={chatLabel} hidden={!chatOpen}>
    {#if chatOpen}{@render chat()}{/if}
  </section>{/if}
</div>

<style>
  .split { display: grid; grid-template-columns: minmax(0, 1fr); min-height: 0; height: 100%; }
  .split.chat-open { grid-template-columns: minmax(0, 1fr) 392px; }
  .split.chat-open.chat-left { grid-template-columns: var(--bot-chat-width, 380px) minmax(0, 1fr); }
  .chat-left .chat { border-left: 0; border-right: 1px solid var(--color-border, #e6e6e9); }
  .chat {
    border-left: 1px solid var(--color-border, #e6e6e9);
    display: flex; flex-direction: column; min-width: 0; min-height: 0;
    overflow: hidden; background: var(--color-surface-muted, #fcfcfd);
  }
  .chat[hidden] { display: none; }
  .canvas { min-width: 0; min-height: 0; overflow: auto; }
  .canvas.canvas-clip { display: flex; flex-direction: column; overflow: hidden; }
  .canvas.canvas-clip > :global(*) { flex: 1; min-height: 0; }
  @media (max-width: 1180px) {
    .split.chat-open {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1.4fr) minmax(0, 1fr);
    }
    .chat { border-left: 0; border-top: 1px solid var(--color-border, #e6e6e9); }
  }
  @media (max-width: 760px) {
    .split.chat-open.chat-left { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
    .chat-left[data-mobile-pane="canvas"] .chat { display: none; }
    .chat-left[data-mobile-pane="chat"] .canvas { display: none; }
    .chat-left[data-mobile-pane="both"] { grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
  }
  @media (min-width: 761px) and (max-width: 1180px) {
    .split.chat-open.chat-left { grid-template-rows: minmax(0, 1fr); grid-template-columns: minmax(280px, var(--bot-chat-width, 340px)) minmax(0, 1fr); }
  }
</style>
