# Cross-border AUSD payments on Monad: system design

Status: proposal, 4 October 2026. Target: Agora's "Best Cross-Border Payments App on Monad"
bounty at Monad Metropolis (deadline 14 October 2026, 11:59 GMT+8). The app is **Ferry**
(`ferry.money`): a ferry carries people and goods between two shores.

## 1. What we are building

A person sends dollars to another person, in another country, from their phone, and it
lands in about a second. The app is the consumer shell Xend already has (design system,
send and receive flows, activity, contacts, push), with the account and money layers
replaced:

| Layer                 | Xend today                                                                                        | The app                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account               | Privy passkey + Turnkey hardware key + server recovery key, 2-of-3 Squads smart account on Solana | One Mera passkey. Face ID is the key. No custody backend.                                                                                                           |
| Identity on the phone | `com.giftedborg.xend`, passkeys at `xend.global`                                                  | `money.ferry.app`, passkeys at `ferry.money`                                                                                                                        |
| Money                 | USDC on Solana                                                                                    | AUSD on Monad testnet (6 decimals)                                                                                                                                  |
| Sending               | Squads vault spend, server co-signed                                                              | Gasless AUSD transfer: the user signs an EIP-3009 authorization, our relayer pays gas. Users never hold MON.                                                        |
| Local bank delivery   | Blockradar NGN off-ramp (merchant side)                                                           | Cash-out through Agora's Instant Settlement pool, followed by an idempotent Yellow Card bank payout. Nigeria/NGN is the first corridor, not the product's identity. |
| Agora API             | none                                                                                              | A client built from Agora's OpenAPI spec. Live for public metrics; mock mode for authenticated endpoints, because API keys are KYB-only.                            |
| Identity              | email + OTP                                                                                       | A handle (`@ada`). No email needed to send or receive.                                                                                                              |

The demo (two minutes, two real iPhones): create an account with Face ID, see an AUSD
balance, send $50 to a friend who gets a push a second later, then the friend cashes out
to local currency through Instant Settlement and opens the receipt on the explorer.

### What is real and what is mocked

Real on Monad testnet: the passkey account, every AUSD balance, every send, the swap on
Agora's Instant Settlement pair, and every receipt (one transaction hash each, on
testnet.monadscan.com).

The authenticated Agora API calls (accounts, routes and transactions) still run against a
spec-shaped mock until Ferry has an Agora organisation key. Fiat payout is no longer a
timer mock: the API has a Yellow Card provider using live partner rates, dynamic bank
networks, Nigerian account-name resolution, idempotent sends and HMAC-verified webhooks.
It remains disabled in an uncredentialed checkout; production requires Ferry to complete
KYB, fund its payout balance and configure its partner keys. The destination asset on
Monad testnet is Agora's CTK; on mainnet the same settlement leg is AUSD to USDC.

### Verified facts the design rests on (read on chain, 4 Oct 2026)

|                         | Value                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chain                   | Monad testnet, id 10143, `https://testnet-rpc.monad.xyz` (25 rps for eth_call; use a provider key from the hackathon perks for the backend)                                                           |
| AUSD                    | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, 6 decimals, EIP-712 domain `{name: "Agora Dollar", version: "1"}`, EIP-3009 live, transfers and signature verification not paused                       |
| AUSD faucet             | `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`: `requestFunds(address)` drips 10,000 AUSD, max 100,000 per wallet, once per 60 s, ~113k gas                                                             |
| Instant Settlement pair | `0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae` ("CTK/AUSD"): token0 CTK (18 dec), token1 AUSD; reserves ~993k CTK / ~1.007M AUSD; price 1:1; both purchase fees 0; not paused. 100 AUSD quotes 100 CTK. |
| Whitelister             | `0x7c10F56d6f04a51376393a1C3670e966863F6BD5`: `setApprovedSwapper(address)` accepts any address, including a contract's (simulated)                                                                   |
| FerrySettlement         | `0x7056D0D544b95ff1c004A588C42dE52e22011Da9` on Monad testnet, deployed and whitelisted 4 October; source in `contracts/`                                                                             |
| FerryFlow               | `0x77b0662bD04798E9982A2df4547929f6B0a46659` on Monad testnet, deployed deterministically in block 68,533,597 on 6 October; source in `contracts/`                                                    |
| CTK                     | `0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D`; no CTK faucet on Monad testnet, so CTK only comes out of the pool                                                                                       |
| Gas                     | ~102 gwei; a transfer is ~80k gas, so about 0.008 MON. 10 MON funds roughly 1,200 sends.                                                                                                              |
| Mera                    | `@category-labs/mera` 0.2.0 (MIT/Apache-2.0), React Native client over `react-native-passkey` pinned 3.6.1; iOS 18.4+ and Android 9+; Expo dev build only                                             |

## 2. The account layer: one passkey

Mera is the whole account layer. There is no email, no OTP, no custody and no server key.

**Creating an account.** `createPasskeyWithPrfOutput({ rp: { id: "ferry.money", name: "Ferry" }, user, webAuthnClient: reactNativeWebAuthnClient })`: one Face ID prompt. The 32-byte PRF output becomes BIP-39 entropy, the seed derives `m/44'/60'/0'/0/0`, and that key's address is the account. The derivation is Mera's published rule, and a unit test pins it to Mera's vector (`0102…20 → 0x50B240678777451BEfd67B7e8c3b4366482ba8F9`) so a library upgrade can never silently change addresses.

**Signing in** (same device or a new one): `getPasskeyPrfOutput({ rpId, credential })`, derive, compare with the stored address. A mismatch (Apple's open bug where a synced passkey yields a different PRF on another device, or a user picking an old Xend Privy passkey from the chooser) shows "This passkey hasn't been used with the app before" instead of an empty balance.

**Keys live in memory only.** The private key exists inside a Mera signing session for the length of one action and is zeroed in `finally`. Nothing secret is persisted: SecureStore holds only `{ address, credentialId, handle }` so the locked state can render without a prompt. Every send and every cash-out is one Face ID. This matches the sibling Desk app and is simpler to defend than persisting PRF output behind biometrics.

**Backend session.** `GET /auth/challenge?address=` returns a nonce; the app signs it (EIP-191) with the same session that just derived the key, so sign-in costs one Face ID; `POST /auth/verify` returns a 7-day JWT with `{ sub, address }`. Stateless, like today.

**Recovery** is the passkey provider's sync (iCloud Keychain, Google Password Manager). Settings offers "Export recovery phrase" (the 24 words; a fresh Face ID prompt, shown once), and the write-up states the trade-off plainly: lose the passkey without a backup and the account is gone.

**Relying party: `ferry.money`.** Ferry is its own product, so it gets its own domain, bought on 4 October. The domain serves two files: `/.well-known/apple-app-site-association` (`webcredentials` with the signing Team ID + `money.ferry.app`) and `/.well-known/assetlinks.json` (the Android package and its certificate fingerprints: debug, EAS, Play). Both over HTTPS, `application/json`, no redirects. They go live on day one, because Apple's CDN can take hours to pick them up. Changing domains later orphans every account, so this is the one decision that cannot be revisited.

## 3. Sending: gasless, one signature, settled in a second

AUSD implements EIP-3009. The user signs a typed-data authorization; our relayer submits it and pays gas. The user never sees MON, never needs a faucet, and signs exactly what the ticket shows.

```
app                          api                             Monad
 │ POST /transfers/prepare    │                               │
 │ {to: "@bola" | 0x…, amount}│ resolve handle → address      │
 │                            │ pin intent 60 s               │
 │ ◀─ typedData, intentId ────│ (domain from chain, nonce =   │
 │                            │  random bytes32,              │
 │ verify fields == ticket    │  validBefore = now+5 min)     │
 │ Face ID → signTypedData    │                               │
 │ POST /transfers/submit ───▶│ recover signer == sender      │
 │ {intentId, signature}      │ caps, simulate               │
 │                            │ transferWithAuthorization ───▶│
 │ ◀─ {transferId, txHash} ───│ (relayer pays gas)            │
 │                            │ receipt → CONFIRMED ◀─────────│
 │                            │ push to recipient             │
```

- The app refuses to sign typed data whose `to` and `value` differ from what the user saw. This is the EVM version of Xend's `checkSpend`.
- The server verifies the signature off-chain (`verifyTypedData`) before spending gas, simulates the call, and sends with an explicit gas limit (Monad bills the limit, not usage).
- Idempotent on `intentId`; one automatic retry on `INTENT_EXPIRED`.
- Errors surface by name: `TransferPaused`, `AccountIsFrozen`, `SignatureVerificationPaused`, `INSUFFICIENT_BALANCE`, `RELAYER_CAP`.
- Caps: per user 20 sends and 5,000 AUSD a day on testnet, global MON spend monitor with an alert below 2 MON.

### Ferry Plus and sponsored-send economics

Gasless does not mean unmetered. Every account receives five Ferry-covered sends per UTC
calendar month. At submit time the API serialises allowance allocation per user and
stores a durable reservation keyed by the signed intent; preparing a payment never burns
an allowance, while concurrent signed submissions cannot overspend it.

Ferry Plus is a 30-day onchain entitlement purchased for 9.99 AUSD with the same
EIP-3009 and Face ID flow as a payment. The signed authorization names Ferry's configured
treasury and exact price. A purchase remains pending until its Monad receipt succeeds,
then grants 50 covered sends and a 2× multiplier for new Ferry Miles earned during the
active interval. It does not auto-renew. The treasury address, price, duration and limits
are server configuration; the mobile client never decides entitlement state.

**Receiving.** The recipient's QR encodes `ferry://pay?to=@bola` with the address as fallback. An indexer polls AUSD `Transfer` logs for addresses we know (every ~2 s, chunked by block range, cursor stored), writes RECEIVE rows, and pushes "You received $50.00 from @ada". Pending sends are confirmed by receipt the same way. HyperSync can replace polling for history later.

### Shared bills

Postgres is the only source of truth for Bills. `bills` owns the bill header,
`bill_shares` owns one exact AUSD obligation per participant,
`bill_invitations` tracks the social response separately from payment state, and
`bill_groups` / `bill_group_members` provide reusable member sets. The creator's
share begins paid; every invited share moves `PENDING → PAYMENT_PENDING → PAID`.
The app never marks a share paid after submission: the indexer verifies the AUSD
receipt, confirms the sender transfer, advances the share, and settles the bill
only when every share is paid.

The authenticated contract is:

- `GET/POST /bills`, `GET /bills/:id`
- `POST /bills/:id/invitation`, `POST /bills/:id/remind`
- `POST /bills/:id/payment/prepare` and `/submit`
- `GET/POST /bill-groups`, `GET /bill-groups/:id`, and
  `POST /bill-groups/:id/members`

Creating a bill resolves handles server-side, checks that every share sums to the
total, and sends every invitee an Expo push. Reminders target unpaid members.
Confirmed payments notify all members with `ferry://bills/:id`; tapping a bill
notification invalidates the local query and opens the shared bill. The app polls
open bills as recovery, so two devices converge even if push delivery is delayed.

**Funding on testnet.** "Add funds" calls the AUSD faucet through the relayer (10,000 AUSD, once a minute). Production USDC funding is implemented as an Agora `stablecoin → ausd` route into the user's registered Monad wallet. Agora returns one reusable deposit address per supported source network; the app renders only those returned instructions, with an explicit USDC/network warning. Mock mode shows a clearly labelled preview and disables copying or sharing its generated addresses. USD bank funding stays marked "Coming soon" until the additional banking and verification work is complete.

## 4. Cross-border: cash out through Instant Settlement, atomically

Agora's Instant Settlement is a fixed-price, zero-slippage pool for verified users. On mainnet it swaps AUSD to USDC (and partner assets) at an oracle price; on testnet Agora deployed a CTK/AUSD pool with self-service whitelisting. We use it as the settlement leg of a cash-out:

```
user signs ONE authorization (Face ID)
   ReceiveWithAuthorization{from: user, to: Settlement, value, validAfter, validBefore, nonce}
   where nonce = keccak256(payoutTo, minOut, salt)      ← binds the swap terms into the signature

relayer calls Settlement.settle(from, value, validAfter, validBefore, nonce, sig, payoutTo, minOut, salt)
   1. require(nonce == keccak256(payoutTo, minOut, salt))        no relayer can redirect the output
   2. AUSD.receiveWithAuthorization(...)                          pulls the user's AUSD into the contract
   3. AUSD.approve(pair, value)
   4. pair.swapExactTokensForTokens(value, minOut, [AUSD, CTK], payoutTo, deadline)
   → one transaction: Transfer + Swap events, one hash on the explorer
```

`Settlement` is about 80 lines of Solidity in `contracts/` (Foundry), owner-less and
stateless: it never holds funds between transactions, so it is not custody. It is
whitelisted once as `APPROVED_SWAPPER` through Agora's whitelister. Tests run against a
fork of Monad testnet, where the real pool and AUSD live. The relayer's only power is
liveness.

Quote before signing: `pair.getAmountsOut(amount, [AUSD, CTK])`, `getPrice()`, both
purchase fees, and a display FX rate for the recipient's home currency (ported from
Xend's `fx` module, display only, with the source named). The ticket shows "You cash out
$100.00 → 100.00 on Agora's pool, fee 0.00, delivered to <payout partner> (mock)".

The payout leg uses Yellow Card's Payments API. A recipient first saves a bank account;
Ferry fetches the provider's live bank list and resolves the account-holder name before
encrypting the account number at rest. Once the Agora settlement transaction confirms,
the backend submits one bank send with the cash-out id as its provider sequence id. The
same id is reused on every retry, so a process restart cannot duplicate a payout. Signed
`PAYMENT.*` webhooks move the payout to its terminal state immediately, with a five-second
provider lookup as recovery if a webhook is delayed.

The production funding model is prefunded last mile: Agora settles AUSD into Ferry's
payout treasury on Monad, while the Yellow Card partner balance pays the local bank and
is rebalanced by treasury. Yellow Card also offers direct crypto-settlement off-ramp, but
its documented network list does not currently include Monad; Ferry must not pretend a
Monad deposit address exists. Direct settlement can replace prefunding when Yellow Card
adds Monad or Ferry adds an audited bridge to a supported USDC network.

Fallback if the contract slips: the relayer does the same three steps as three
transactions (about 1.2 s on Monad). Not atomic; kept only as insurance.

## 5. Agora API

Built from `https://docs.agora.finance/openapi.json` (`https://api.agora.finance/v0`,
API key → 15-minute session JWT). One interface, two implementations selected by
`AGORA_API_MODE`:

- `live`: `GET /v0/metrics` (public; AUSD supply per chain, shown on the home screen as "AUSD on Monad" so the live integration is visible) and the authenticated endpoints once Agora issues a key.
- `mock`: spec-shaped responses for `accounts` (register the user's wallet on `monad`, request the `instant_settlement` entitlement → `pending_approval`), `routes` (a reusable `stablecoin → ausd` USDC funding route plus the `ausd → usd` production cash-out route), and `transactions` (a settled `redeem` with `isInstantSettlement: true` and an `instantPayment` leg, shown on the cash-out receipt).

`POST /wallet/deposits/usdc` is authenticated and derives the destination exclusively
from the session principal. The mobile app never submits a destination wallet and never
receives the Agora organisation key. The response contains the route id, live/preview
mode and the filtered USDC deposit instructions needed by the deposit screen.

The write-up says exactly this: production needs an Agora organisation key; the client is complete and switchable.

## 6. Backend

A fresh NestJS app, `apps/api`, replacing `apps/backend`. Reason: the old backend cannot boot without Kafka, half of it is merchant checkout, its 56 migrations are Solana-shaped, and the account, settlement and payment modules import each other. Porting the six modules we want (`config`, `db`, `common`, `health`, `notifications`, `fx`, plus the mailer if we keep it) is cheaper and safer than carving.

| Module              | Responsibility                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config`            | Joi-validated env: `DATABASE_URL`, `JWT_SECRETS`, `MONAD_RPC_URLS`, `AUSD_ADDRESS`, `CTK_ADDRESS`, `PAIR_ADDRESS`, `WHITELISTER_ADDRESS`, `SETTLEMENT_ADDRESS`, `FAUCET_ADDRESS`, `RELAYER_PRIVATE_KEY`, `RELAYER_CAP_*`, `AGORA_API_MODE`, `AGORA_API_KEY?`, `EXPO_ACCESS_TOKEN`, `FX_*`              |
| `db`                | Drizzle over Postgres. Tables: `users` (address unique, handle unique, display name, home currency, country), `transfers`, `transfer_intents`, `bills`, `bill_shares`, `bill_invitations`, `bill_groups`, `bill_group_members`, `cashouts`, `payouts`, `push_devices`, `indexer_state`, `agora_mock_*` |
| `auth`              | challenge/verify, JWT guard, `Principal { userId, address }`; rate-limited                                                                                                                                                                                                                             |
| `directory`         | handle registration (3–20 chars, unique, reserved list), profile, `GET /directory/:handle` → `{ address, displayName }`; no reverse listing                                                                                                                                                            |
| `chain`             | viem public client with RPC failover, relayer wallet client, AUSD typed-data builder (domain read once at boot), receipt waiter, explicit gas, MON balance monitor                                                                                                                                     |
| `transfers`         | prepare / submit / list (the HTTP contract the mobile app already speaks, see §7)                                                                                                                                                                                                                      |
| `settlement`        | quote / prepare / submit for cash-outs; binds a verified bank destination into the signed quote                                                                                                                                                                                                        |
| `payout`            | Yellow Card HMAC client, live rates and bank discovery, account-name resolution, encrypted payout accounts, idempotent bank sends and signed webhooks                                                                                                                                                  |
| `indexer`           | AUSD `Transfer` log poller, receipt confirmation, RECEIVE rows, pushes                                                                                                                                                                                                                                 |
| `agora`             | the OpenAPI client, live and mock                                                                                                                                                                                                                                                                      |
| `fx`                | display rates (ported)                                                                                                                                                                                                                                                                                 |
| `notifications`     | Expo push (ported)                                                                                                                                                                                                                                                                                     |
| `bills`             | shared bills and groups, member authorization, invitations, reminders, and bill-bound AUSD payment intents                                                                                                                                                                                             |
| `health`, `metrics` | `/health` with chain, db and relayer-balance checks                                                                                                                                                                                                                                                    |

Infra: Postgres only. No Redis, no Kafka. Deployed on Railway with its Postgres plugin; the relayer key is an env var now (KMS is a follow-up and the signer is behind an interface, Xend's ADR 0010 pattern).

## 7. Mobile

`apps/mobile` stays. The HTTP contract between `utils/apiClient.ts` and the backend is preserved in shape, with chain words renamed: `mint → token`, `signature → txHash`, `feeLamports` dropped, `unsignedTxBase64 → typedData`, `presenceProof` dropped. `TransferRow` keeps `direction / amountRaw / fromAddress / toAddress / status / memo / usdValue / decimals`, loses `kind` and `merchantName`, gains `counterpartyHandle`. The Home, Send, Receive, Activity and Contacts screens change little.

Removed: Privy, Turnkey, the hardware-key native module, every Squads hook, runner and settings screen, swap / earn / investments / card / plus, the Pay screens, Solana utils, Bonfida, `react-native-passkeys` (replaced by `react-native-passkey@3.6.1`), email OTP.

Added: `lib/mera` (polyfills first, ceremony, derivation with the pinned-vector test, signing session), `lib/chain` (viem read client as the offline fallback for balances, explorer links), the onboarding flow (Welcome → Face ID → pick handle and home currency → Home), Cash out (amount → quote → Face ID → receipt), Settings (profile, export phrase, app lock, sign out). Dev-seed mode is kept and updated so UI work never waits on the backend.

Native config: name "Ferry", slug `ferry`, scheme `ferry`, bundle id and package `money.ferry.app`, `ios.deploymentTarget` 18.4, `ios.associatedDomains: ["webcredentials:ferry.money"]`, `android.minSdkVersion` 28. iOS is the demo platform; Android gets a build if time allows, since Mera's path there is the same code.

## 8. Security notes

- No server ever holds a user key. The relayer can spend only its own MON.
- A transfer authorization names `to` and `value`; a cash-out's nonce commits to `payoutTo` and `minOut`. The relayer cannot alter either.
- The app verifies the typed data it signs against the ticket; the server verifies the signature before spending gas and simulates before sending.
- Authorizations expire in 5 minutes and nonces are random 32 bytes; replay is impossible by construction (EIP-3009 `authorizationState`).
- Address guard on every sign-in; handle lookups are rate-limited and never enumerate.
- AUSD's control flags are read before quoting and their reverts are shown by name.

## 9. Plan (today is 4 October; the deadline is the 14th, 03:59 UTC)

| Day   | Deliverable                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4–5   | Repo surgery; `apps/api` boots on Postgres with `/health`; association files live on ferry.money; Mera onboarding on a real iPhone; pinned-vector test passes; auth challenge/verify |
| 6     | Balances; faucet funding; handles; gasless Send end to end with receipt; Activity; indexer and "You received" push                                                                   |
| 7     | `Settlement` contract: fork tests, deploy, verify, whitelist; cash-out quote/prepare/submit; payout provider; Agora client (live metrics, mock rest)                                 |
| 8     | FX display; error states; dev seed; Android build and assetlinks if time                                                                                                             |
| 9     | Full rehearsal on two phones; fixes                                                                                                                                                  |
| 10    | Demo video, README, submission text (candid about the Xend base and the mocks)                                                                                                       |
| 11–13 | Buffer. Desk's deadline is the same day.                                                                                                                                             |

## 10. Decisions needed

1. ~~Name and domain~~: Ferry, `ferry.money`, `money.ferry.app`. Decided 4 October.
2. Which Apple developer account signs the app (its Team ID goes into the association file) and where `ferry.money` is hosted (a static site on Vercel is enough; the API can live at `api.ferry.money`).
3. The demo corridor: sender's and recipient's countries and home currencies.
4. Where the backend runs and who owns the relayer key.
5. Who collects testnet MON for the relayer (several faucets, a few days in advance).
6. Android in the demo, or iOS only.
7. Drop email entirely (recommended; the handle is the identity).
