# Ferry Flows: programmable incoming money

Status: experimental MVP, 5 October 2026.

## Product promise

Ferry is a money account for people paid across borders. A Flow lets a person decide what
happens when money lands, without asking the sender to understand the rule or exposing
wallets, contracts, gas, networks, or basis points in the product.

> When money lands, Ferry moves it for you.

The first Flow is a percentage split. A recipient can keep part of every payment spendable,
put part into named pockets, forward part to another Ferry user, or route part toward a
supported bank payout. The first onchain release supports wallet destinations. A bank
destination remains an explicit second settlement leg: it is not represented as complete
until the payout provider confirms it.

This is not a budgeting simulation. The split executes atomically on Monad and produces one
transaction hash. Either every onchain destination receives its share or none does.

## Consumer model

A Flow has one to five destinations. Each destination has:

- a consumer-facing label, such as `Spendable`, `Tax`, or `Mum`;
- a kind: `spendable`, `pocket`, `person`, or `bank`;
- a resolved onchain address for the AUSD settlement leg;
- a whole-number percentage in the app and basis points at the API/contract boundary.

Allocations must total exactly 100%. The default draft is 70% Spendable, 20% Savings, and
10% Tax. It is only a draft: Ferry never activates a rule until the user reviews it and signs
with the account passkey.

`person` labels may originate as Ferry handles, but the API resolves and pins their address
before asking for a signature. `bank` is a composite destination. Its onchain share settles
to the configured Ferry settlement address, then follows the existing quoted payout state
machine. A bank share must never be described as delivered while that payout is pending.

## Onchain model

The Flow contract stores the active destination addresses and basis points for an owner.
Configuration is gasless to the owner:

1. Ferry prepares EIP-712 typed data containing the owner, a hash of the ordered destination
   list, the owner's exact next configuration nonce, and a short deadline.
2. The app compares the typed data with the reviewed allocation and signs it with the Mera
   account.
3. The relayer submits the signed configuration. The contract verifies the owner signature,
   deadline, nonce, destination count, non-zero addresses, and a 10,000 basis-point total.

Paying a Flow also uses one user signature:

1. The API resolves the recipient handle to its owner address and reads the active rule.
2. The payer signs an AUSD EIP-3009 `ReceiveWithAuthorization` whose `to` is the Flow
   contract and whose amount is the amount shown in Ferry.
3. The relayer calls `executeFlow` with the resolved owner and authorization.
4. The contract pulls exactly that AUSD amount and distributes it using the stored rule.
5. Integer dust is assigned to the final destination so the output always equals the input.

An owner without an active Flow receives 100% at the owner's address. This keeps one send
path for every Ferry recipient and makes disabling a Flow safe.

## API contract

All routes require the existing Ferry bearer session.

### `GET /flows/me`

Returns the authenticated owner's current consumer model:

```json
{
  "enabled": true,
  "destinations": [
    {
      "label": "Spendable",
      "kind": "spendable",
      "address": "0x...",
      "basisPoints": 7000
    }
  ],
  "version": 3,
  "updatedAt": "2026-10-05T10:00:00.000Z"
}
```

### `POST /flows/prepare`

Accepts one to five destinations whose basis points total 10,000. It resolves any external
identifiers, pins the normalized ordered list in a short-lived intent, and returns the
configuration EIP-712 typed data. The intent expires and cannot be mutated after creation.

### `POST /flows/submit`

Accepts an `intentId` and signature. It verifies that the signer is the authenticated owner
and that the signature matches the pinned rule before relaying it. Repeating the same submit
returns the original result. A different signature or payload cannot reuse the intent.

### `POST /flows/payments/prepare`

Accepts `{ "to": "@ada", "amount": "100.00" }`. It resolves the owner, pins the exact
amount and rule target, and returns AUSD EIP-3009 typed data authorizing the Flow contract.
The app must verify the token, contract, amount, validity window, and nonce before signing.

### `POST /flows/payments/submit`

Accepts the payment `intentId` and AUSD authorization signature, verifies the signer and
pinned fields, simulates execution, and relays `executeFlow`. Repeated submission is
idempotent and returns the original transaction state.

## States and reconciliation

Configuration states are `PREPARED`, `SUBMITTING`, `SUBMITTED`, `CONFIRMED`, `FAILED`,
and `EXPIRED`. Payment states are `PREPARED`, `SUBMITTING`, `PENDING`, `CONFIRMED`, and
`FAILED`; an external payout leg can add `REVERSED` when that integration is enabled.

`SUBMITTING` is committed before a relayer network call. It is a durable no-double-broadcast
claim, not a success state. A retry first searches the contract events using the signed
configuration nonce or EIP-3009 authorization nonce. It never blindly emits another
transaction while the original outcome is ambiguous.

A provider or RPC timeout after relay is `PENDING`, never an immediate failure. The API
reconciles by transaction hash. The mobile app shows what is known, preserves the receipt,
and does not encourage a duplicate payment.

## Security invariants

- The passkey relying party and Mera key derivation do not change.
- The relayer key remains server-side and never enters a public environment variable.
- Destination order is signed because rounding dust belongs to the final destination.
- Configuration nonces are exact and monotonically increasing; signatures cannot replay.
- Prepared intents are immutable, short-lived, bound to the authenticated address, and
  idempotent on submit.
- The app signs only after comparing every typed-data field with the review screen.
- Logs and analytics never include signatures, passkey material, full bank details, or
  unredacted payout identifiers.

## MVP boundaries

The MVP includes percentage Flows, onchain wallet distribution, a premium create/edit/review
experience, receipt state, and tests at all three layers. `spendable` resolves to the owner's
wallet and `person` resolves to a distinct Ferry handle or wallet. `pocket` and `bank` remain
visible product directions but cannot be activated until the API can resolve them to a real,
distinct settlement destination; Ferry must not simulate a split by sending several labelled
shares back to the same address.

The MVP does not include yield, salary streaming, behavioral conditions, recurring pulls,
arbitrary tokens, or a claim that a bank payout is atomic with the onchain split. Those can
build on the same intent and receipt model after the percentage Flow is reliable.

## Activation checklist

The UI, API, database migration, and contract are implemented, but Flows are not live until
the contract is deployed and the same address is configured on both clients:

1. Deploy `FerryFlow` with the network's AUSD address.
2. Run the API database migration.
3. Set `FLOW_CONTRACT_ADDRESS` and `FLOW_DEPLOYMENT_BLOCK` on the API.
4. Set `EXPO_PUBLIC_FLOW_CONTRACT_ADDRESS` to that same contract in the mobile build.
5. Fund the relayer and run a two-account testnet journey: configure, send, reconcile,
   inspect activity, disable, and send through the owner fallback.

Until those values are configured, production sends continue through Ferry's existing
direct-transfer path and the seed account labels the Flow builder as a local preview.
