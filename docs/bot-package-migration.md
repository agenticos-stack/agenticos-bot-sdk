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
repository is now `agenticos-stack/agenticos-bot-sdk`. Use this repository for
all five packages' npm trusted-publisher settings; do not use the old name.

Internal public-package dependencies use only bot names and exact versions.
The experimental testkit is renamed locally to `@agenticos-dev/bot-testkit`
but remains private/unpublished. Existing application repositories, including
Notes, require their own dependency migration; this change does not silently
change their installed artifacts or platform identity.

The bot 0.1.0 packages passed anonymous registry installation and hash checks.
The owner subsequently reported deleting the old npm packages. Do not depend
on their availability or recreate them: use only bot packages going forward.
Initial gadget release evidence is retained as historical evidence, not as an
installation recommendation. Existing bot 0.1.0 tarballs still contain their
original repository metadata; corrected metadata ships in the next version.
