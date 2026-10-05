# Ferry Miles: product and system design

Status: implementation baseline, 6 October 2026

## Product boundary

Ferry Miles is a non-transferable loyalty system for verified actions inside
Ferry. It is not a token, cash balance, stablecoin, security, yield product, or
promise of future value. Miles cannot be bought, sold, deposited, withdrawn,
or converted to AUSD.

The experience borrows the useful interaction model of premium rewards apps:
a calm balance, visible progress, a clear invitation action, short earning
rules, and compact detail sheets. It does not copy another product's assets,
tier names, reward rates, or card benefits.

## Why qualification follows settlement

Mature referral programs do not reward a raw signup. Wise requires an invited
person to complete an eligible money action, while Revolut shows a checklist of
required onboarding and transaction steps. Ferry follows the same principle:
the referral qualifies only when the invitee's first outbound Ferry payment is
confirmed. This ties the reward to demonstrated product value and makes fake
account farms more expensive.

Apple's App Review Guidelines also prohibit cryptocurrency rewards for tasks
such as encouraging downloads or referrals. Ferry therefore awards only
non-transferable Miles, never AUSD or another onchain asset, for this program.

Sources:

- Wise referral qualification: https://wise.com/help/articles/1uFefNcZjE1ri1wNPczJdo/how-do-i-invite-friends
- Revolut referral requirements: https://help.revolut.com/en-US/help/referrals/more-help-with-referrals/referrals-new/what-are-the-conditions-of-the-referral-campaign/
- Apple App Review Guidelines 3.1.5(v): https://developer.apple.com/app-store/review/guidelines/
- Agora Terms and its separately eligible AUSD Loyalty Rewards Program: https://static.agora.finance/termsofuse.pdf

## Earning rules

The initial rules are one-time milestones, not infinitely repeatable volume
rewards:

| Verified event                                  | Miles |
| ----------------------------------------------- | ----: |
| First confirmed Ferry payment                   |   250 |
| First confirmed Ferry Flow                      |   250 |
| First completed bank delivery                   |   500 |
| Inviter after invitee's first confirmed payment | 1,000 |
| Invitee after their first confirmed payment     |   250 |

Local Bills activity is intentionally excluded because it is not yet a
verifiable settlement event. AUSD rewards or yield must remain disabled unless
Agora separately confirms eligibility and an approved rate.

## Ledger and idempotency

`reward_events` is append-only. Every event has a globally unique business key
such as `first-transfer:<userId>` or `referral:<referralId>:inviter`. Inserts use
conflict-safe idempotency, so refreshes, retries, concurrent devices, and
multiple API instances cannot double-credit a milestone.

Balances are derived from the signed integer event ledger instead of being
stored as a mutable counter. Corrections use an explicit adjustment event; old
events are never rewritten. The client reads the server ledger and never
calculates authoritative points locally.

## Referral lifecycle

1. Ferry creates a random invite code that reveals neither a wallet address nor
   a database identifier.
2. An invitee can attach one code before their first settled outbound payment.
3. Self-referrals and replacement codes are rejected.
4. The referral stays `PENDING` until a confirmed payment exists.
5. Qualification locks the referral row and inserts inviter and invitee events
   with different idempotency keys in one transaction.
6. The app refreshes the ledger in the foreground and every fifteen seconds on
   rewards surfaces, and invalidates it when transaction state changes.

Before monetary partner rewards are introduced, production hardening should
add device/account graph checks, velocity limits, sanctions and fraud review,
an operations reversal workflow, and a versioned campaign/rules table.

## UX placement

Miles is not a permanent tab. A compact entry appears on Home and Profile,
opening a focused rewards screen. This preserves Ferry's three-tab information
architecture and keeps the payment balance as Home's primary job.

The full screen contains only:

- Miles balance, level, and progress;
- Invite friends and member-level actions;
- verified activity/referral breakdown;
- short milestone cards;
- append-only Miles activity;
- a concise terms sheet.

The invitation screen keeps the share control within thumb reach and explains
the three-step qualification in plain language. It never presents points as
dollars or implies guaranteed financial value.
