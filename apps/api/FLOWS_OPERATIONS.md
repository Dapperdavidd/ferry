# Ferry Flows operations

Flows use three persistence boundaries: a signed intent, a durable submission claim, and a
confirmed onchain receipt. Operators should reason about the database state and contract
events together; a missing RPC response is never proof that a transaction failed.

## Scheduled maintenance

`FlowOperationsService` runs every 10 seconds under the Postgres advisory lock
`flow_operations`. It performs only safe, non-broadcasting work:

- expired `PREPARED` rows become `EXPIRED` with `INTENT_EXPIRED`;
- hashless `SUBMITTING` rows are searched by their contract replay key (owner plus
  configuration nonce, or the EIP-3009 authorization nonce);
- an event match repairs the transaction hash, consumes the intent, and restores the sender
  activity row idempotently;
- an unresolved claim older than two minutes remains `SUBMITTING` and is labelled
  `SUBMISSION_OUTCOME_UNKNOWN`;
- hashed `SUBMITTED`/`PENDING` rows older than ten minutes are counted as stale while the
  existing indexer continues receipt reconciliation.

The maintenance job never submits or resubmits a transaction. A `SUBMITTING` row without an
event can represent a wallet/RPC error after broadcast, so automatically retrying it can
double-send or hide the successful transaction behind a later reverted hash.

## Structured signals

The service writes key/value log records without addresses, signatures, bank data, or amounts:

- `flow.ops.snapshot` — expired, recovered, unresolved, and stale receipt counts;
- `flow.ops.recovered` — kind and internal record ID;
- `flow.ops.outcome_unknown` — a stale ambiguous claim requiring attention;
- `flow.ops.lookup_failed` — event lookup failed and should be retried by the scheduler;
- `flow.ops.failed` — the maintenance pass itself failed.

Alert on a sustained non-zero `unresolved_submissions` or `stale_receipts`, rather than a
single tick. RPC propagation and normal block production can briefly make both non-zero.

## Operator response

1. Check at least two Monad RPC providers and the configured explorer for the replay-keyed
   FerryFlow event. `FLOW_DEPLOYMENT_BLOCK` must be the deployment block or earlier.
2. If the event exists, let the next scheduled pass repair the row; do not manually send the
   signed payload again.
3. If no event exists, preserve the row and investigate relayer/RPC logs. An ambiguous claim
   is intentionally availability-biased toward safety.
4. Only a receipt with explicit `reverted` status becomes `FAILED`. Receipt-not-found and
   timeouts remain pending/unknown.

No runbook action should expose `RELAYER_PRIVATE_KEY`, signatures, authorization nonces, or
full customer payout details.
