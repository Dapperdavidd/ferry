# Ferry

Send dollars across borders from your phone, settled in a second.

Ferry is a native mobile app on **Monad**. The money is **AUSD**, Agora's dollar. The
account is one **Mera passkey**: Face ID creates it and signs every payment, with no seed
phrase, no wallet app and no custody server. Sends are gasless (the user signs an
authorization, Ferry's relayer pays), and cash-outs settle atomically through **Agora's
Instant Settlement** pool.

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

|                                                                 |                                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passkey account, AUSD balances, sends, cash-out swaps, receipts | Real, on Monad testnet (chain 10143). Every action has a transaction hash on [testnet.monadscan.com](https://testnet.monadscan.com).                                                               |
| Agora API                                                       | A client built from Agora's OpenAPI spec. Public metrics are live; accounts, routes and transactions run in mock mode because Agora issues API keys only to KYB'd institutions and has no sandbox. |
| Fiat payout after the pool                                      | Mocked and labelled as such. On testnet the pool's other side is Agora's test token CTK; on mainnet the same leg is AUSD to USDC.                                                                  |

## Layout

Turborepo over npm workspaces.

| Workspace      | What it is                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile`  | The Expo React Native app (`@ferry/mobile`). iOS first; Android shares the code.                                                         |
| `apps/api`     | The NestJS API on Postgres (`@ferry/api`): auth, handles, transfers, cash-outs, the relayer, the indexer, the Agora client. In progress. |
| `apps/site`    | The static site at `ferry.money`, which also serves the passkey association files.                                                       |
| `apps/backend` | Xend's old backend, kept only until `apps/api` has ported what it needs, then deleted. Not part of the install.                          |
| `packages/*`   | Shared ESLint and TypeScript configs.                                                                                                    |

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
```

The one test that must never be allowed to fail is
`apps/mobile/lib/mera/__tests__/derive.test.ts`: it pins the key derivation to Mera's
published vector. If it fails, addresses have changed and users cannot reach their money.

## Docs

- [`docs/specs/cross-border-ausd-design.md`](docs/specs/cross-border-ausd-design.md): the system design, the on-chain facts it rests on, and the open decisions.
- [`docs/adr/`](docs/adr/README.md): Xend's architecture decisions. Those about styling and the Expo setup still apply; those about Solana, Squads, Privy and Pay with Xend are history.
