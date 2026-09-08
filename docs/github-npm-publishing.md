# GitHub npm publishing

Run `npm-release.yml` manually **from staging**, providing that run's exact
40-character source SHA. A successful staging push run of `ci.yml` must already
exist for it. The workflow packs once, verifies hashes, and publishes only those
artifacts after the `npm-release` environment approval. No npm token secret is
used. Actions are SHA-pinned and publication uses GitHub-hosted OIDC.

## Owner setup before enabling

1. In GitHub Settings → Environments, configure `npm-release` with a required
   owner reviewer and allow deployments only from the `staging` branch.
2. For each of the five existing bot packages, add an npm GitHub trusted
   publisher: organization `agenticos-stack`, repository `agenticos-bot-sdk`,
   workflow `npm-release.yml`, environment `npm-release`, Allow npm publish on.
3. Verify all five configurations, then update `release-policy.json` through a
   reviewed PR to declare `trustedPublisher: configured`. It deliberately stays
   `not-configured` until verified; landing this workflow does not enable it.
4. Prepare new versions through a PR. All five candidate versions must be
   available: this first workflow refuses occupied versions rather than skipping
   them. Before moving beyond 0.1.0, replace the initial-only bootstrap check in
   regular CI with the configured trusted-publisher readiness check.
5. Run staging CI, dispatch publication for that SHA, inspect the candidate
   artifact, then approve the environment job. Keep the publication receipt.

The deleted bot-devkit cannot be restored by this workflow yet: npm's full
unpublish cooldown still applies, its old version cannot be reused, and its
initial restoration needs publishing authentication before package-level trust
can be reconfigured. Do not delete packages to change trust settings.

Published integrity is checked against each local tarball. Anonymous package-name
consumer installation is still a separate post-release acceptance step; registry
metadata may take time to propagate. Multi-package publication is not atomic.
On partial failure inspect the receipt and registry state; do not blindly rerun,
unpublish successful packages, or overwrite previously published bytes.
