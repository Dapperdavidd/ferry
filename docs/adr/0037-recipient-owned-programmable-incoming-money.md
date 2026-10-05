# 0037: Recipient-owned rules route incoming AUSD atomically

**Status:** Accepted
**Date:** 2026-10-05
**Deciders:** Ferry product and engineering
**Tags:** mobile, backend, contracts, payments, security

## Context and Problem Statement

Ferry needs a defining consumer-finance capability that uses onchain rails as a product
advantage without exposing crypto mechanics. A normal wallet send does not meet that bar.
The useful behavior is at the recipient: decide once where future money should go, while a
sender continues to make one ordinary payment.

Implementing that behavior only in the UI or API would make distribution custodial,
non-atomic, and hard to verify. Letting the sender provide an arbitrary split would make the
recipient's rule mutable at payment time. Retrying a relayer call after an ambiguous network
failure could also produce a duplicate or hide a successful first transaction.

## Decision Drivers

- A non-crypto user must see a familiar send and percentage-allocation experience.
- Every onchain destination must succeed or the entire payment must revert.
- The recipient owns the ordered rule; the sender cannot substitute it.
- Configuration and payment signatures must be gasless, short-lived, and replay-safe.
- A network timeout must not cause an automatic duplicate payment.
- Bank and pocket labels must not imply settlement before real destinations exist.

## Considered Options

1. **Recipient-owned onchain Flow rule** — store the signed rule in `FerryFlow`; send one
   owner-bound EIP-3009 authorization and distribute atomically.
2. **API fan-out** — receive funds in a Ferry-controlled wallet and issue several transfers.
3. **Sender-specified split** — include arbitrary destinations in every payment request.

## Decision Outcome

Chosen option: **Recipient-owned onchain Flow rule.** It creates a genuinely programmable
consumer account while keeping the sender flow ordinary and making the routing result
atomic and independently auditable.

The ordered rule contains one to five distinct addresses and basis points totaling 10,000.
The final destination receives rounding dust. Configuration uses a sequential, deadline-
bound EIP-712 signature. Payment uses AUSD EIP-3009 to the Flow contract, with the Flow
owner encoded into the authorization nonce so the relayer cannot select another rule.

The API commits `SUBMITTING` before any relay attempt. A proven pre-broadcast failure can
release that claim for a safe retry. An ambiguous wallet submission remains claimed and is
recovered only from replay-keyed contract events; Ferry does not auto-rebroadcast it.

The feature stays disabled unless the same deployed contract address is configured in the
API and mobile build. Pocket and bank destinations remain non-activatable until each can
resolve to a real, distinct settlement destination.

### Consequences

- Good: one user action produces an atomic, verifiable distribution with no gas burden on
  either consumer.
- Good: recipient intent, destination order, and payment ownership are cryptographically
  bound rather than trusted to UI state.
- Good: existing direct sends remain the fallback while the contract gate is unset.
- Bad: changing a Flow requires an onchain transaction and relayer availability.
- Bad: an ambiguous submission with no eventual event needs operator review or a new intent;
  Ferry chooses that inconvenience over a possible duplicate payment.
- Bad: bank delivery is a separate, non-atomic settlement leg and cannot be described as
  complete until the payout provider confirms it.

## More Information

- Product and protocol spec: `docs/specs/ferry-flows-design.md`
- Contract: `contracts/src/FerryFlow.sol`
- API orchestration: `apps/api/src/flows/flows.service.ts`
- Mobile typed-data verification: `apps/mobile/utils/flowAuthorization.ts`
