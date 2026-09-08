# Studio shell and chat adapter handoff

Status: live integration design handoff only. A local SDK chat fixture now exists;
see [its contract and verified host gaps](chat-fixture.md). This document records the extraction boundary
from the existing Studio implementation; it does not copy Studio/API source
and does not claim that an adapter has been implemented.

## Scope and ownership

The public SDK owns framework-neutral contracts first. Its future `shell`
package may own presentation components, but it must not own authentication,
tenant/workspace authorization, model execution, approval policy, session
cookies, platform credentials, or a second chat/history store. Studio and API
remain privileged hosts and provide adapters to those contracts.

The SDK is public and independent. The canonical public contract therefore
belongs to the SDK repository and is versioned there. It is not a new
API-only canonical contract or a copy of Studio's private types. API may later
adapt/re-export a compatible version through its existing contract package;
Studio consumes the SDK contract and retains its host implementation.

Each installable gadget remains in its own repository. No gadget source,
Studio history, private fixtures, credentials, or internal-only modules are
to be copied into this repository.

## Smallest split extraction

The smallest reusable shell is the presentation-only split layout currently
implemented by:

`studio/src/lib/studio/gadgets/GadgetSplitView.svelte`

Its extraction target is a Svelte presentation component with two rendered
surfaces and layout options equivalent to the following. Only transport and
host contracts are framework-neutral; `Snippet` is a Svelte-specific slot type:

```ts
type SplitShellProps = {
  chat: Snippet;
  canvas: Snippet;
  canvasLabel?: string;
  canvasScroll?: "auto" | "clip";
  chatOpen?: boolean;
};
```

The component owns only the grid, bounded pane scrolling, desktop/stacked
responsive ordering, and accessible pane labels. It does not know gadget IDs,
workspaces, routes, users, permissions, or transport. `chat` and `canvas`
remain caller-owned slots so app-only, app-with-chat, and chat-first hosts can
choose their content without a second shell.

Loading and error visuals can be added as separately configurable shell slots,
based on `GadgetLoadingState.svelte` and `GadgetErrorState.svelte`. Their
current Studio i18n and navigation dependencies must become text/callback
props before public extraction. `DashboardGadgetSurface.svelte` and the
workspace route are consumers, not extraction targets: they load records,
resolve permissions, navigate, and own Studio state.

`GadgetSandboxFrame.svelte` is not part of the minimum public shell. It is the
Studio host adapter that connects an opaque iframe to the privileged gadget
runtime. The public SDK must expose only a typed host/transport boundary; the
ticket, authenticated socket, and RPC implementation stay in Studio/API.

## Frame adapter lifecycle that must remain true

The eventual Studio adapter may wrap these existing owners, without copying
their implementation into the SDK:

- `GadgetSandboxFrame.svelte` owns the iframe element, `message` listener, and
  bounded console forwarding.
- `gadget-frame-session.ts` owns idle/connecting/live state, deferred restore
  during handshake, forced restore after chat/code changes, reconnect pacing,
  and teardown.
- `gadget-server-port.ts` owns ticketed workspace socket acquisition,
  ref-counting, `connectToGadget(gadgetId, chatId)`, stale-session checks,
  view-only method admission, RPC-break abandonment, and disposal.
- `gadget-client.ts` owns route-keyed API calls and expected-revision conflict
  outcomes.
- `gadget-sandbox-html.ts` owns the opaque-origin document and restrictive CSP.

The adapter must preserve these checks:

1. The iframe omits `allow-same-origin`; it cannot read host cookies, storage,
   or DOM, and its CSP does not permit arbitrary network fetches.
2. Accept `message` events only when `event.source` is the current iframe
   window. Accept only the handshake, escape, and bounded console message
   shapes; reject duplicate or stale handshakes and close their ports.
3. Serve the MessagePort only after the ticketed live gadget stub connects.
   Close both MessagePort and RPC/session references on teardown.
4. A chat/workspace context change forces a fresh frame session. A code
   revision change forces reload; a dead stub is not revived in place.
5. Keep workspace socket references identity-safe: release the session actually
   acquired, abandon broken cached sessions, and never decrement a replacement
   session opened by a sibling frame.
6. View-only mode allows subscription/read methods only. Client metadata never
   grants capability; host authorization is checked on every call.
7. Keep the console budget (currently 40 lines/second) and avoid forwarding
   secrets, cookies, hidden prompts, or unrelated tenant data.

## Chat adapter boundary

`StudioChatThread.svelte` is reusable presentation, not a chat engine. It
currently consumes `ChatMsg[]` from `studio/src/lib/studio/chat-view-types.ts`
and renders `ChatMessage`, activity/tool rows, sources, artifacts, loading and
empty states. Its large Studio-specific callback surface should be hidden
behind a normalized SDK view model rather than copied into a new engine.

The existing proof of this separation is the pure mapper:

`studio/src/lib/studio/v2/chat-v1-view.ts`

`toChatMessages()` maps the current conversation entries into the existing
thread visual model. It replaces presentation input, not the runtime.

The Studio adapter should wrap the existing `AgentConsole` and its injected
`AgentSession` transport:

- `studio/src/lib/studio/v2/agent-console.svelte.ts`
- `studio/src/lib/studio/v2/agent-session.ts`
- `studio/src/routes/(studio)/chat/[id]/+page.svelte` (current history/read reconciliation owner)
- `studio/src/lib/studio/v2/conversations.ts` (current history read client)
- `studio/src/lib/studio/v2/chat-v1-view.ts`

The adapter must delegate `open`, durable history loading, `send`, `stop`,
decision/ask responses, subscriptions, and close. `AgentConsole` remains the
only client-side session coordinator: it already handles generation guards,
bounded reconnect backoff, refusal versus transient loss, raw events,
decisions, pending asks, and gadget refresh. Do not create another WebSocket
runner, agent loop, transcript database, approval engine, or model client.

A first SDK-owned normalized contract can be shaped as follows (names are
illustrative; the SDK owns the final version):

```ts
export type SelectedRecordRef = {
  type: string;
  id: string;
  revision?: number | string;
  label?: string;
};

export type ChatContext = {
  workspaceId: string;
  conversationId: string;
  selectedRecords?: readonly SelectedRecordRef[];
};

export interface ChatAdapter<Message, Event = unknown> {
  open(context: ChatContext): Promise<{
    subscribe(listener: (event: Event) => void): () => void;
    close(): void;
  }>;
  loadHistory(context: ChatContext, options?: {
    limit?: number;
    cursor?: string;
  }): Promise<{ messages: readonly Message[]; nextCursor?: string }>;
  send(input: {
    text: string;
    selectedRecords?: readonly SelectedRecordRef[];
    expectedRevisions?: readonly SelectedRecordRef[];
    effort?: string;
  }): Promise<void>;
  stop(): Promise<{ stopped: boolean }>;
  decide(actionId: string, approve: boolean): Promise<{
    applied: boolean;
    reason?: string;
  }>;
  close(): void;
}
```

The host must clear context when workspace/conversation identity changes. IDs,
labels, and capability metadata are descriptive only; they do not authorize a
call. Selected references must carry explicit revisions where mutation is
possible. Authorization, ownership, grants, approval admission, stale
revision handling, and MCP policy remain server decisions.

Current audit correction: the chat route's variable `workspaceId` is its
conversation ID, not the containing gadget workspace ID. Keep those identities
separate. Current history loading has no cursor/limit support; a live adapter
must reject unsupported pagination rather than silently ignore it. Retired
`chat-page-conversation-data.ts` and `chat-stream-client.ts` are not current
integration owners (some historical test names below remain audit references).

Next extraction must adopt a single private history reader in the route before
SDK delegation. Capture conversation identity and read generation; check both
after async reads and before opening a session. Current inline `refreshHistory`
and `switchConversationSession` lack those guards. Reuse canonical
`projectHistory`/`projectConversation`, preserve aligned payload arrays and
advance the live-event boundary only after successful current reads. No second
transcript store should be introduced.

The playground can implement this contract with a fixture adapter and a local
runtime adapter, each with a persistent visible mode label. Fixture mode must
deny unknown actions and never fall back to live credentials. Neither adapter
may silently connect to staging.

## Existing test owners to preserve

Frame/shell behavior:

- `studio/tests/gadget-frame-session.test.ts`
- `studio/tests/gadget-server-port.test.ts`
- `studio/tests/work-object-components.test.ts`
- `studio/tests/studio-home-revamp.test.ts`

Chat/runtime projection:

- `studio/tests/studio-chat-thread.test.ts`
- `studio/tests/chat-thread-definite-height.test.ts`
- `studio/tests/chat-harness-scenarios.test.ts`
- `studio/tests/chat-room-transcript.test.ts`
- `studio/tests/chat-stream-client.test.ts`
- `studio/tests/chat-page-conversation-data.test.ts`
- `studio/tests/v2-chat-v1-view.test.ts`
- `studio/tests/chat-composer-wiring.test.ts`
- `studio/tests/chat-composer-layout.test.ts`
- `studio/tests/chat-composer-dock.test.ts`

The SDK repository should add contract-level tests for subscription disposal,
cancellation, stale context generations, pending/denied outcomes, unknown
protocol versions, and fixture deny-by-default behavior. Studio remains the
owner of browser DOM tests; the public SDK must not import Studio components or
private API modules merely to reuse those tests.

## Staged local validation

Validation is intentionally staged and local before any publication:

1. **Contract stage:** run the SDK's dependency-free Node tests. Verify the
   adapter contract has no API/Studio imports, credentials, customer fixtures,
   or live URLs.
2. **Studio unit stage:** in an owned Studio worktree, run only the focused
   frame, chat projection, stream, and component tests above. Do not add a
   second runtime to make them pass.
3. **Local route stage:** use the normal loopback Studio/API rig. Exercise the
   real gadget route and chat route at desktop and 390px widths; verify
   keyboard focus, split ordering, drawer close/restore, reconnect, teardown,
   context cleanup, and unsaved edits across chat collapse.
4. **Mode stage:** run playground fixture and local-runtime modes separately.
   Show their mode labels and verify fixture calls never reach live transport.
5. **Integration stage:** only after the above passes, validate a private
   authenticated install against the deployed staging SHA under the normal
   release process. This handoff authorizes no deployment, publication,
   migration, provider call, or external write.

No standalone second chat engine is proposed. A presentation-only shell
candidate has since been extracted locally; privileged Studio/API code remains
outside the SDK. The illustrative interface above is not the final live API.
