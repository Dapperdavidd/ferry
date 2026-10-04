# Ferry developer handoff

Updated 5 October 2026. This document describes the state merged into `main`, what is
already functional, what still depends on partner access, and the safest path for the next
developer to continue.

## Product in one paragraph

Ferry is an iOS-first consumer payments app for AUSD on Monad. A Mera passkey is the
account, Face ID authorizes payments, handles make recipients human-readable, and the
backend relays EIP-3009 transfers so users do not need MON for gas. The main product loop
is add money, send AUSD to a Ferry user, or deliver value to that user's saved local bank
account. Nigeria and NGN are the first bank corridor, but the product and UI are not
country-specific.

Read `CLAUDE.md`, then `README.md`, then
`docs/specs/cross-border-ausd-design.md` before changing the money or identity layers.
The design spec is the architecture source of truth and `apps/mobile/utils/apiClient.ts`
is the mobile/API contract in code.

## What has been built

### Identity, onboarding, and brand

- The product name, bundle identity, deep-link scheme, associated domain, app icon,
  splash assets, and in-app mark are Ferry. The native bundle is `money.ferry.app`, the
  scheme is `ferry`, and the passkey relying party remains `ferry.money`.
- Onboarding was simplified back to a direct account-creation flow after testing a more
  elaborate monochrome concept. The Ferry logo remains the permanent identity.
- Backgrounding no longer presents the oversized branded privacy cover that looked like
  the app was relaunching. Passkey and app-lock behavior remain intact.
- The key derivation in `apps/mobile/lib/mera/derive.ts` and the `ferry.money` relying
  party are invariants. Do not change either.

### Home and navigation

- The home screen was rebuilt around the spendable AUSD balance with more deliberate
  vertical rhythm, bolder type, premium pill actions, a branded cash-out feature card,
  recent activity, and a floating native-style tab bar.
- Add money and Send are first-class actions. Cash out is a separate highlighted route.
- The AUSD network chip opens a compact Mainnet/Testnet selector. The configured build
  network is marked Connected. Selecting the other network is currently a preview only;
  money actions are blocked until that network is actually configured.
- The home screen and send/cash-out screens use designed card surfaces, subtle rings,
  gradients, brand marks, and direct network logos instead of plain black rectangles or
  generic logo containers.

### Send flow

- Recipient entry accepts a Ferry `@handle`, Monad address, or scanned Ferry payment QR.
- A pasted recipient is committed before amount entry, so typing the amount does not
  overwrite or concatenate with the recipient.
- The amount screen keeps the custom keypad and quotes direct bank delivery when the
  recipient has a verified payout account.
- Confirmation is a single-screen receipt-style ticket with one back affordance,
  recipient and live-rate information, and Face ID confirmation.
- The app can perform a normal gasless AUSD wallet send or a Ferry Direct settlement that
  pays the recipient's saved local bank account. The signing progress screen and success
  receipt were restyled to the same premium card language.

### Funding

- Add money now has a dedicated route rather than a generic modal.
- Testnet exposes the real Agora AUSD faucet through `POST /wallet/fund`.
- USDC deposit exposes a reusable Agora `stablecoin -> ausd` route through
  `POST /wallet/deposits/usdc`. The screen renders only networks and addresses returned by
  the API and uses actual network marks.
- Mock Agora mode is explicitly a safe preview: addresses cannot be copied or shared.
  They become actionable only when the API is running with approved live Agora access.
- USD bank funding intentionally remains Coming soon. It needs the additional banking,
  compliance, and account-verification product work; do not present it as live.

### Local-bank delivery

- The API now contains a Yellow Card payout provider with HMAC-signed requests, live bank
  discovery, account-name resolution, rate lookup, idempotent sends, send recovery, and
  signed webhook verification.
- Users can save a verified payout account from Settings. The account number is encrypted
  with AES-256-GCM before being stored; public API responses return only the bank name and
  final four digits.
- A direct quote resolves the recipient, verifies that the recipient has a payout account,
  prices the local delivery, and binds the payout data to the cash-out record.
- After the on-chain settlement confirms, the API submits the bank payout with the cash-out
  id as the provider sequence id. Retries reuse that id so a restart cannot create a second
  payment. Yellow Card webhooks advance the payout status.
- The provider is disabled by default. It is production-shaped code, not a claim that the
  corridor is operational without KYB approval, credentials, a funded partner balance,
  and a completed sandbox rehearsal.

### Native iOS and TestFlight packaging

- The mobile workspace is on Expo 57 / React Native 0.86 and still supports normal Xcode
  archives; EAS is optional.
- `apps/mobile/app.config.ts` now reads the static values from `app.base.json` and applies
  the local `with-ios-archive-symbols` config plugin.
- The plugin prevents React Native's nested framework dSYMs from being copied inside
  `Ferry.app` (which App Store Connect rejects with error 90171), then collects matching
  top-level archive dSYMs for Expo, React Native, Hermes, and SDWebImage frameworks.
- The final source adjustment avoids creating a duplicate React dSYM. The next developer
  should create and upload a fresh archive after checkout to confirm App Store Connect
  accepts the final generated project.

## API additions in this release

All routes below use the existing JWT principal unless noted otherwise.

| Method and route                   | Purpose                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `POST /wallet/deposits/usdc`       | Register/reuse the user's Agora wallet route and return USDC deposit instructions.                                  |
| `GET /payout/networks`             | Return active bank networks for a country and currency.                                                             |
| `GET /payout/account`              | Return the current user's redacted verified payout account.                                                         |
| `PUT /payout/account`              | Resolve, verify, encrypt, and store a payout account.                                                               |
| `POST /cashout/direct/quote`       | Quote AUSD settlement followed by delivery to a Ferry recipient's bank.                                             |
| `POST /payout/webhook/yellow-card` | Consume an HMAC-verified Yellow Card payment update. This endpoint is intentionally public at the controller level. |

Database migration `apps/api/drizzle/0001_overconfident_imperial_guard.sql` adds encrypted
payout metadata to users and payout state to cash-outs. Run it before starting the updated
API against an existing database.

## Environment and external access

Start from `apps/api/.env.example` and `apps/mobile/example.env`. Never commit real keys.

For the current Monad testnet app the API still needs Postgres, JWT secrets, RPC URLs,
contract addresses, and a funded relayer private key. Live USDC routes additionally need
`AGORA_API_MODE=live` and an approved `AGORA_API_KEY`.

Bank delivery additionally needs:

- `PAYOUT_PROVIDER=yellowcard`
- a stable 32-byte hex `PAYOUT_DATA_KEY` (64 hex characters); changing it makes stored
  account numbers unreadable
- `YELLOW_CARD_ENV`, `YELLOW_CARD_API_KEY`, `YELLOW_CARD_API_SECRET`, and
  `YELLOW_CARD_WEBHOOK_SECRET`
- `YELLOW_CARD_BUSINESS_ID`, a funded provider balance, and the correct send reason for
  Ferry's approved use case
- `PAYOUT_PARTNER_ADDRESS`, the Monad treasury address that receives settlement output

The provider must remain disabled until the sandbox request shapes, signature rules,
webhook header, retry behavior, payout limits, and compliance requirements have been
verified against Ferry's actual Yellow Card account.

## Run and verify locally

```sh
npm install
cp apps/api/.env.example apps/api/.env
cp apps/mobile/example.env apps/mobile/.env
npm run db:up
npm run db:migrate
npm run dev:api
npm run dev:mobile
```

Run the repository checks before merging:

```sh
npm run check-types
npm run lint
npm test
```

The passkey derivation vector in
`apps/mobile/lib/mera/__tests__/derive.test.ts` is the release-blocking test. A changed
derived address strands user funds.

For a normal Xcode/TestFlight build:

```sh
cd apps/mobile
npx expo prebuild --platform ios --clean
cd ios
bundle exec pod install || pod install
open Ferry.xcworkspace
```

In Xcode select the Ferry target and a generic iOS device, then use Product > Archive and
Distribute App > App Store Connect. Do not manually copy dSYM folders into a framework or
into `Ferry.app`; the config plugin owns that packaging. After every clean prebuild,
confirm the project was opened through `Ferry.xcworkspace`, not `Ferry.xcodeproj`.

## What the next developer should do

1. Create a fresh Release archive from a clean prebuild and upload it to TestFlight. Check
   that the upload has neither missing-symbol warnings nor nested-dSYM error 90171, and
   bump the iOS build number before each upload.
2. Run the complete two-device physical-iPhone rehearsal: create/sign in with passkeys,
   fund from the testnet faucet, send by handle and QR, background/foreground the app,
   inspect activity, and open the explorer receipt. PRF passkeys do not work correctly in
   the simulator, so simulator-only QA is insufficient.
3. Apply the new database migration in staging and test all payout-account routes with a
   disposable database.
4. Once partner access arrives, test Agora live deposit routes and the entire Yellow Card
   sandbox lifecycle before enabling either feature in production. Add contract tests from
   captured, redacted provider responses rather than relying only on hand-built fixtures.
5. Add end-to-end tests for the direct-send state machine, especially settlement confirmed
   plus payout retry, delayed webhook, duplicate webhook, rejected payout, and app restart.
6. Replace the temporary mainnet selector preview with a real build/runtime network
   configuration only when all mainnet addresses, RPCs, relayer, settlement contract, and
   provider treasury are ready. Never let the label switch while the signing client remains
   on another chain.
7. Finish accessibility, small-device layout, offline/error-state, and Android device QA.
   The visual pass is strongest on the current iPhone reference size; keep the calm white,
   black, warm-metal, and soft-shadow system when polishing other sizes.

## Known boundaries

- Agora authenticated APIs are mocked unless a real organisation key is configured.
- Yellow Card bank payouts are disabled unless the server is deliberately configured.
- USD bank deposits are not implemented and are labelled Coming soon.
- Mainnet selection is a preview when the installed build is configured for testnet.
- Generated `apps/mobile/ios` output and local `.xcarchive` files are not source artifacts.
  Regenerate native code from Expo config; do not commit local signing products.
- `apps/backend` is the legacy Xend backend and is not a place for new Ferry work.
