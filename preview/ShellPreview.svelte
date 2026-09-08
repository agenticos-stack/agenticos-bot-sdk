<script>
  import Shell from '../packages/shell/GadgetSplitView.svelte';
  let chatOpen = $state(true);
</script>

<header>
  <strong>Gadget shell · fixture preview</strong>
  <button onclick={() => chatOpen = !chatOpen} aria-expanded={chatOpen}>Toggle conversation</button>
</header>
<main>
  {#snippet chat()}
    <div class="pane">
      <h2>Conversation</h2>
      <p>Simulated host slot. No model or external connection.</p>
      <label for="message">Message</label>
      <input id="message" placeholder="Fixture only" />
    </div>
  {/snippet}
  {#snippet canvas()}
    <div class="pane">
      <h1>App canvas</h1>
      <p>Type a draft, then collapse and reopen the conversation. This field must keep its value and DOM identity.</p>
      <label for="draft">Draft</label>
      <textarea id="draft" rows="6" placeholder="Your unsaved draft"></textarea>
    </div>
  {/snippet}
  <Shell {chat} {canvas} {chatOpen} />
</main>

<style>
  :global(body) { margin: 0; color: #242529; background: #fff; font-family: sans-serif; }
  header { min-height: 64px; padding: 12px 20px; box-sizing: border-box; display: flex; gap: 16px; align-items: center; justify-content: space-between; border-bottom: 1px solid #e6e6e9; }
  main { height: calc(100dvh - 88px); min-height: 300px; }
  .pane { padding: 24px; min-width: 0; overflow: auto; }
  h1, h2 { margin-top: 0; font-size: 22px; }
  p { line-height: 1.6; max-width: 60ch; }
  label { display: block; margin-bottom: 8px; }
  input, textarea { box-sizing: border-box; width: 100%; font: inherit; padding: 12px; border: 1px solid #bfc1c7; border-radius: 4px; }
  button { font: inherit; padding: 10px 14px; background: #fff; border: 1px solid #bfc1c7; border-radius: 4px; cursor: pointer; }
  :global(:focus-visible) { outline: 2px solid #805b17; outline-offset: 3px; }
</style>
