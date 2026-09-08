# Fixture transport and host integration boundary

This example runs against the packed SDK export. It is a fixture, not a real
agent, persisted app or platform authorization decision.

```js
import {
  createFixtureTransport,
  GADGET_TRANSPORT_PROTOCOL
} from '@agenticos/gadget-sdk';

const transport = createFixtureTransport({
  handlers: {
    readDraft: ([id]) => ({ ok: true, value: { id, caption: 'Example draft' } }),
    requestPublication: () => ({
      ok: false, code: 'fixture_pending', message: 'Simulated decision only.', pending: true
    })
  }
});

const result = await transport.call({
  protocolVersion: GADGET_TRANSPORT_PROTOCOL,
  method: 'readDraft',
  args: ['draft-example'],
  context: {
    protocolVersion: GADGET_TRANSPORT_PROTOCOL,
    selected: [{ type: 'draft', id: 'draft-example', revision: 1 }]
  }
});

if (!result.ok) console.error(result.code, result.message);
else console.log(result.value);
transport.close();
```

For live use, Studio supplies a `GadgetTransport` adapter after its existing
authenticated host connection succeeds. The adapter maps native RPC outcomes
to the public result envelope, preserves subscription disposal and rejects
stale workspace sessions. The fixture implementation is never upgraded into
a live transport by changing its mode or supplying a URL.

Selected IDs and revisions describe context, not permission. The real host
checks membership, ownership, capability grants and approval on calls. Unknown
methods remain refused; no generic helper-method exposure is introduced.

An AbortSignal cancels waiting for a result; it does not promise rollback or
server cancellation. A host adapter must report any actual server-stop result
separately. Closed transports must not be reused after workspace navigation.

## Package acceptance

Install the pinned compiler with `npm ci --ignore-scripts --no-audit --no-fund`,
then run `npm run test:package`. The test packs the allowlisted SDK files, installs
the tarball into a fresh temporary consumer with an empty npm configuration and
cache in offline mode, imports the public export, and verifies success/refusal/
close behavior. It asserts that no runtime dependency was installed, then
strictly typechecks the public package declarations in the consumer and removes
its temporary directory. The acceptance test does not contact a registry or
publish; the initial development dependency installation may use the registry.

This checks the transport package only. It does not yet prove that a complete
gadget, archive builder, shell or SQLite testkit works outside the platform repo.
