# Chat adapter: local fixture contract

The SDK exports `GadgetChatAdapter` and `createFixtureChatAdapter`. This is a
local contract candidate, not an implemented Studio bridge or chat engine.
It reuses the fixture transport's cancellation, disposal and refusal behavior.
No transcript store, socket, reconnect loop, model client or approval policy
is introduced. Host-projected history and events remain opaque for now; the
normalized rendering model is a separate unfinished part of the plan.

```js
import { createFixtureChatAdapter } from '@agenticos-dev/bot-sdk';

const chat = createFixtureChatAdapter({
  context: { workspaceId: 'fixture-workspace', conversationId: 'fixture-chat' },
  handlers: {
    loadHistory: () => ({ ok: true, value: { messages: [] } }),
    send: () => ({
      ok: false, code: 'fixture_pending',
      message: 'Simulated approval required; nothing was sent.', pending: true
    })
  }
});
const result = await chat.send({
  text: 'Refine this draft',
  selected: [{ type: 'draft', id: 'example', revision: 3 }]
});
// Present result as simulated. Unconfigured stop/answer operations are refused.
chat.close();
```

Only `loadHistory`, `send`, `stop` and `answer` handlers are admitted. Handlers
must return explicit result envelopes; a void return is invalid, not success.
Input and selection references are detached before asynchronous dispatch.
The fixture validates selection shape, not existence, ownership or freshness.
Revisions are optional for read-only context; mutation safety must be enforced
by the live host. Cancellation settles the caller, not a rollback guarantee.

The adapter is bound to one immutable workspace/conversation identity. The
host closes it on identity change, clears its selected records and visual
projection, then creates a replacement. Closing disposes listeners and settles
pending callers. This helper cannot clear host-owned UI state automatically.
Do not share selections or history between those identities.

## Verified live-host gaps

Inspected Studio `origin/staging` at
`03b66cea37e51133e4d28e8d162bc809e3d247b7` on 2026-09-07:

- `AgentConsole.send()` accepts text, effort and message/attachment/mention/reply
  metadata, but no structured selected-record/revision field. The underlying
  `RemoteAgentSession.runTurn()` has the same limitation. The future adapter
  must refuse unsupported selected context until an API-backed path exists;
  do not silently drop it or serialize it into trusted instructions.
- Console `send`, `stop` and `answer` return `Promise<void>` and own their
  recovery/state updates. Their completion is not an acceptance receipt.
  Do not fabricate `{ ok: true }`, a run ID or an applied approval from it.
- The existing console remains the lifecycle owner. A Studio bridge needs a
  minimal, tested outcome/projection hook on that owner, not a new direct
  socket/session that bypasses it.

Next live integration work: define that hook in owned API/Studio feature
worktrees, preserve refusal/queued/settled distinctions, then prove context
switching and reconnect behavior in the existing focused tests. This fixture
does not satisfy TASK-012 or authorize public publication.

## Host prerequisite in progress

Studio PR [#836](https://github.com/agenticos-stack/agenticos-studio/pull/836)
adds `sendWithOutcome()` to the existing console, retaining the legacy void
`send()` method. It distinguishes local rejection, unchanged RPC results,
stale sessions, requested interruption and transport uncertainty. A returned
RPC result is not proof that all its actions ran. The focused console suite
passes 72 tests; removing the stale-session guard makes its regression fail.
This is merged into staging but not consumed by the SDK. The same PR also adds
`answerWithOutcome()` and `stopWithOutcome()`, preserving unapplied approval
results and distinguishing server stop acknowledgement from local teardown.
Generation guards protect replacement sessions. The two focused console files
pass 87 tests after review follow-ups. History projection, selected-record support and SDK wiring
remain outstanding.

Staging SHA `7b3dbee26ead2c83022b1a4b7827036878be7878` passed verification,
build and deployment in run `34170503524`. Deployment health returned that exact
appVersion with status ok; immutable release evidence artifact `10035588106`
was uploaded. Production was not promoted. Authenticated chat interaction on
deployed staging has not been manually verified for this batch.
