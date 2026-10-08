# Ferry Together release handoff

This note gives collaborators a single review entry point for the Ferry Together release
landed in `d72ffaa` and deployed on October 9, 2026.

## Shipped experiences

- **Ferry Requests** creates payment links and QR codes backed by real AUSD transfers.
- **Ferry Drop** escrows AUSD for someone who has not joined Ferry yet. The recipient
  creates or restores a Mera passkey, signs a recipient-bound claim, and receives the
  funds without exposing a seed phrase.
- **Ferry Table** lets several devices claim receipt items in real time and finalizes the
  result as a shared bill.
- **Settle the Night** nets several group expenses into no more than `members - 1`
  transfers and closes the underlying bill shares after every leg confirms onchain.
- **Smart reminders** support gentle, playful, and urgent tones, push delivery, and bill
  deep links.
- **Recurring circles** create monthly bills for rent, subscriptions, trips, and group
  contributions.

Postgres is the durable source of truth. Server-sent events invalidate client queries on
every member's device, Expo push notifications carry deep links, and the blockchain
indexer—not an optimistic client response—confirms payment completion.

## Deployment

| Target        | Status  | Ferry Drop contract                          |
| ------------- | ------- | -------------------------------------------- |
| Monad testnet | Enabled | `0x8d422Ecdb5b746867Bb2bFD266C97c61F3963996` |
| Monad mainnet | Enabled | `0xf1aa6D0dDdCAC00C553F801eDEaf24f6CB616FB5` |

Both Railway API environments report healthy database, chain, and relayer checks. iOS
build `17` was built from the release and submitted to TestFlight through EAS.

## Verification

- API: 94 tests passing across 25 suites.
- Mobile: 80 tests passing across 18 suites.
- Contracts: 33 tests passing across six suites, including fuzz and invariant runs.
- Testnet and mainnet API `/network` responses expose the correct chain-specific Drop
  address and enable the `drops` capability.

## Suggested review path

1. `apps/api/src/social/` — requests, tables, recurring circles, and settlement logic.
2. `apps/api/src/drops/` — Drop preparation, submission, claims, refunds, and receipt
   reconciliation.
3. `contracts/src/FerryDrop.sol` — recipient-bound escrow contract.
4. `apps/mobile/app/social.tsx` and its request, table, settlement, and Drop routes.
5. `apps/api/src/indexer/indexer.service.ts` — authoritative onchain reconciliation.
6. `apps/api/src/db/schema.ts` and migrations `0008` through `0012`.

The remaining release check is a two-device TestFlight rehearsal: create or scan a Table,
claim different receipt items, settle it, verify both devices update, and then repeat the
invite-to-claim flow with Ferry Drop.
