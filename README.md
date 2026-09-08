# AgenticOS Gadget SDK

Local foundation for a future public SDK repository. Not published, not yet
integrated with Studio, and not a production SDK release. License selection is
pending; no permission to redistribute existing platform code is implied.

This repository will own SDK transport contracts, development CLI, reusable
shell, playground and testkit. Each actual gadget belongs to a separate
repository and consumes versioned SDK artifacts. API and Studio retain the
privileged host adapters, authentication, agent execution and capability policy.

The local foundation includes dependency-free transport/chat fixtures, an
extracted presentation shell, canonical archive/definition tooling and trusted
local init/check/pack commands. It does not connect to a live API, provide a DO
testkit, run a model, authorize an action or publish a gadget.

Run the foundation tests with `npm test` on Node 22 or later. No dependency
installation or Cloudflare account is needed for this initial batch.

Run `npm ci --ignore-scripts --no-audit --no-fund` once to install the pinned
development compiler, then `npm run test:package` for a real offline tarball
installation and strict TypeScript check in an empty temporary consumer.
The compiler is not an SDK runtime dependency.
See [the transport example](docs/transport-example.md) for
fixture usage and the live-host boundary. Public publication is still pending.
See [the chat fixture](docs/chat-fixture.md) for isolated chat-adapter development
and the verified gaps that must be addressed before live Studio integration.

Run `npm run test:shell` for the extracted Svelte shell checks. For an API-free
interactive fixture, run `npm run preview:shell` and open
`http://127.0.0.1:17922/`. The server binds loopback only and builds once at
startup; restart it after edits. This is not a Studio session or live agent.

Run `npm run test:devkit` for isolated tooling checks. To test an independently
owned app from a clean temporary consumer, run:

```sh
node scripts/check-independent-app.mjs /path/to/app-repository --trust-source
```

This packs local tooling, copies only the app's source/build/test inputs,
installs the dependency closure offline, tests/builds/validates, compares repeat
build bytes, and verifies exclusive output handling. Its npm cache must already
contain the pinned public transitive dependencies. It proves local dependency
closure and artifact behavior, not host authorization or DO persistence.

See [the developer CLI](packages/devkit/README.md) for the reviewed-template
`init` limitation and [batch evidence](docs/developer-batch-2026-09-08.md) for
completed checks versus outstanding release gates.
