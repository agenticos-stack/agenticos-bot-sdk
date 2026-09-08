# `@agenticos-dev/gadget-sdk`

Dependency-free transport contract and explicit fixture transport foundation.
This package does not connect to a live API, handle credentials, or grant
authority. Hosts supply handlers and remain responsible for authentication and
policy.

Fixture handlers return plain-object `GadgetCallResult` envelopes, never a void
invocation treated as success. Successful receipts may carry a non-negative
safe-integer `revision`; refusals require non-blank `code` and `message`, boolean
`pending`/`retryable` flags when supplied, and a non-blank `correlationId` when
supplied. Invalid envelopes become `fixture_handler_invalid_result`. Valid
receipts and application-specific metadata are preserved without rewriting them.

Chat inputs validate selected-record revisions, optional non-blank
`clientMessageId`, non-blank history cursors, and positive safe-integer history
limits before dispatch. This is shape validation, not authorization or a promise
that a host supports pagination: live adapters must explicitly refuse unsupported
cursor/limit or selected-record semantics. No live adapter ships in this package
yet, and fixture acceptance is not evidence of live compatibility.
