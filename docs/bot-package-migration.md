# Public package naming: gadget → bot

The owner requested this naming change on 2026-09-08. The npm scope remains
`@agenticos-dev`; only the public package family changes.

| Existing package | Replacement package |
| --- | --- |
| `@agenticos-dev/gadget-sdk` | `@agenticos-dev/bot-sdk` |
| `@agenticos-dev/gadget-shell` | `@agenticos-dev/bot-shell` |
| `@agenticos-dev/gadget-devkit` | `@agenticos-dev/bot-devkit` |
| `@agenticos-dev/gadget-archive-tools` | `@agenticos-dev/bot-archive-tools` |
| `@agenticos-dev/gadget-contract` | `@agenticos-dev/bot-contract` |

Replacement packages start at 0.1.0 and retain the existing APIs. Update package
dependencies and import specifiers; do not rewrite blueprint keys, workspaces,
`.gadget` archive extensions or platform protocol values. The devkit provides
`bot-dev` and preserves `gadget-dev` as a compatibility alias. The GitHub
repository name remains agenticos-gadget-sdk, outside this package rename.

Internal public-package dependencies use only bot names and exact versions.
The experimental testkit is renamed locally to `@agenticos-dev/bot-testkit`
but remains private/unpublished. Existing application repositories, including
Notes, require their own dependency migration; this change does not silently
change their installed artifacts or platform identity.

The previously published gadget 0.1.0 tarballs and release evidence remain
immutable. Only after new bot packages pass anonymous registry-install and
hash checks should the old 0.1.0 versions receive npm deprecation messages
pointing to their replacements. Do not unpublish old versions or overwrite
their bytes. Initial gadget release evidence is retained separately.
