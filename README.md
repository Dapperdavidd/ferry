# Ferry

Send dollars from your phone and receive them in a wallet or local bank.

Ferry is a native mobile app on **Monad**. The money is **AUSD**, Agora's dollar. The
account is one **Mera passkey**: Face ID creates it and signs every payment, with no seed
phrase, no wallet app and no custody server. Sends are gasless (the user signs an
authorization, Ferry's relayer pays), and cash-outs settle atomically through **Agora's
Instant Settlement** pool.

**Ferry Flows** adds programmable incoming money: a recipient can save a percentage rule
once, then a payment sent to their Ferry handle is atomically routed across up to five
onchain destinations. The sender still sees a normal Send flow; wallets, gas, contracts,
and basis points stay out of the consumer experience. Flows are deployed and enabled on
Monad testnet; mainnet remains behind the explicit contract-address gate until its deployment
has been audited and rehearsed.

**Ferry Plus** turns gas sponsorship into a consumer entitlement instead of an invisible
unbounded subsidy. Free accounts receive five covered sends each UTC month. A real 9.99
AUSD onchain purchase activates 30 days of Plus, 50 covered sends and 2× newly earned
Ferry Miles. The API reserves each covered send by intent under a database lock, so the
allowance cannot be bypassed with concurrent submissions; the app only displays the
server's result.

Built for Agora's "Best Cross-Border Payments App on Monad" bounty at Monad Metropolis,
October 2026. The design is in
[`docs/specs/cross-border-ausd-design.md`](docs/specs/cross-border-ausd-design.md).

## Where it comes from

Ferry starts from [Xend](https://github.com/EntrypointLabs/xend-global), a consumer
payments app on Solana: its Expo shell, design system, send/receive/activity flows and
backend patterns. Everything that touched money or identity is new: Mera passkeys replace
Privy, Turnkey and a 2-of-3 Squads account; Monad and AUSD replace Solana and USDC;
Agora's Instant Settlement and API replace merchant checkout. The first commit is the
untouched Xend snapshot, so the whole refit is reviewable as a diff from it.

## What is real and what is mocked

|                                                                 |                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passkey account, AUSD balances, sends, cash-out swaps, receipts | Real, on Monad testnet (chain 10143). Every action has a transaction hash on [testnet.monadscan.com](https://testnet.monadscan.com).                                                                                                                                                                  |
| Ferry Flows                                                     | Contract, API, migration, event reconciliation, mobile configuration/review, and tests are implemented. FerryFlow is live on Monad testnet at `0x77b0662bD04798E9982A2df4547929f6B0a46659`; mainnet stays gated off. Without a configured deployment, sends retain the existing direct-transfer path. |
| Agora API                                                       | A client built from Agora's OpenAPI spec. Public metrics are live. USDC deposit routes, accounts and transactions switch from a clearly labelled safe preview to the real API when Ferry has an approved Agora organisation key.                                                                      |
| Fiat payout after the pool                                      | A production Yellow Card adapter now resolves bank accounts, prices the local payout, creates idempotent bank sends and consumes signed webhooks. It is disabled until Ferry has KYB credentials and a funded partner balance. Monad testnet still settles to CTK; mainnet settles AUSD to USDC.      |

## Layout

Turborepo over npm workspaces.

| Workspace      | What it is                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/mobile`  | The Expo React Native app (`@ferry/mobile`). iOS first; Android shares the code.                                                                                   |
| `apps/api`     | The NestJS API on Postgres (`@ferry/api`): auth, handles, balances and test funds, gasless transfers, cash-outs, the relayer, the indexer, push, the Agora client. |
| `apps/site`    | The static site at `ferry.money`, which also serves the passkey association files.                                                                                 |
| `contracts`    | Foundry contracts: deployed `FerrySettlement` for one-transaction cash-out, plus deployment-ready `FerryFlow` for atomic programmable incoming-money routing.      |
| `apps/backend` | Xend's old backend, kept only until `apps/api` has ported what it needs, then deleted. Not part of the install.                                                    |
| `packages/*`   | Shared ESLint and TypeScript configs.                                                                                                                              |

## Funding

Testnet builds can request test AUSD from Agora's faucet. Production builds expose a
reusable USDC → AUSD route for each Ferry wallet: the API registers the wallet with
Agora, creates or retrieves its stablecoin mint route, and the app renders only the
deposit networks and addresses Agora returns. Mock mode shows the complete flow but
disables address copy and sharing so nobody can mistake a generated address for a live
deposit. USD bank funding remains marked **Coming soon** until Ferry completes the
additional banking and verification work.

## Prerequisites

- Node 24 or newer (Mera requires it), npm 10
- Docker, for Postgres (`npm run db:up`)
- For the app: Xcode and a real iPhone on iOS 18.4 or newer. Passkeys with PRF do not run in
  the simulator, and Expo Go cannot load the native modules; use a development build.

## Setup

```sh
npm install
cp apps/mobile/example.env apps/mobile/.env
```

Fill in `EXPO_PUBLIC_BACKEND_URL` once the API is running.

## Running

```sh
npm run db:up                     # Postgres in Docker
npm run dev:api                   # the API, once apps/api exists
npm run dev:mobile                # Metro
npm --workspace @ferry/mobile run ios   # a development build on the connected iPhone
```

## Checks

```sh
npm run check-types
npm run lint
npm run test
npm --workspace @ferry/api run build
cd contracts && forge fmt --check && forge build --sizes && forge test
```

The one test that must never be allowed to fail is
`apps/mobile/lib/mera/__tests__/derive.test.ts`: it pins the key derivation to Mera's
published vector. If it fails, addresses have changed and users cannot reach their money.

## Docs

- [`docs/specs/cross-border-ausd-design.md`](docs/specs/cross-border-ausd-design.md): the system design, the on-chain facts it rests on, and the open decisions.
- [`docs/specs/ferry-flows-design.md`](docs/specs/ferry-flows-design.md): the consumer model, signed intent protocol, contract execution, recovery rules, and activation checklist for Flows.
- [`docs/adr/`](docs/adr/README.md): Xend's architecture decisions. Those about styling and the Expo setup still apply; those about Solana, Squads, Privy and Pay with Xend are history.
