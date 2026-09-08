# AgenticOS Gadget SDK

Public SDK source foundation. npm release setup is in progress; not yet
integrated with Studio, and not a production SDK release. The owner selected
Apache-2.0 for this SDK and its reviewed extracts. This does not relicense the
private platform repositories or separately installed third-party dependencies.

This repository will own SDK transport contracts, development CLI, reusable
shell, playground and testkit. Each actual gadget belongs to a separate
repository and consumes versioned SDK artifacts. API and Studio retain the
privileged host adapters, authentication, agent execution and capability policy.

The local foundation includes dependency-free transport/chat fixtures, an
extracted presentation shell, canonical archive/definition tooling and trusted
local init/check/pack commands, and an experimental real-workerd DO facet
testkit. It does not connect to a live API, run a model, authorize an action or
publish a gadget.

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

Run `npm run test:testkit` for real local DO facet storage/restart/isolation
checks after dependency installation. The optional packed Notes acceptance
requires an explicit archive path; see [the testkit](packages/testkit/README.md).
These tests do not prove production tenant admission or schema upgrades.

See [npm release preparation](docs/npm-release.md) for candidate packaging,
owner setup and the non-publishing readiness workflow. No npm login or
Cloudflare credentials are needed for these local checks. The owner approved
the initial 0.1.0 publication; registry verification is a separate release step.
