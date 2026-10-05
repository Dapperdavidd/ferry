# @ferry/mobile

The Ferry app: an Expo React Native client for iOS and Android. It talks to `@ferry/api`
over HTTPS with a token earned by signing a challenge with the passkey-derived key.

Expo SDK 56, expo-router, NativeWind. Use a development build; Expo Go cannot load the
native modules. Passkeys need a real device on iOS 18.4+ or Android 9+.

## What is in the app

Routes live under `app/`.

- **Welcome** (`(auth)/login.tsx`): create an account or unlock with Face ID. One Mera passkey is the whole account.
- **Onboarding** (`onboarding.tsx`): pick a handle, a name and a home currency. The handle is what people send to.
- **Home** (`(tabs)/index.tsx`): the AUSD balance, Send, Cash out, Receive, and on testnet Add test funds.
- **Send** (`components/ui/organisms/send/`, `(send)/confirm.tsx`): to a `@handle`, a Monad address, a contact or a scanned QR. The confirm screen checks the typed data it is about to sign against the ticket, field by field, then one Face ID.
- **Cash out** (`cashout.tsx`): a quote from Agora's Instant Settlement pool, then one Face ID.
- **Activity** (`(tabs)/history.tsx`): sends, arrivals, cash-outs and top-ups, each with its MonadScan link.
- **Settings** (`(tabs)/settings/`): account, address book, notifications, recovery phrase, sign out, delete.

`lib/mera` is the account layer (create, sign in, derive, sign, store). `lib/chain` reads
Monad directly when the API is unreachable. `utils/apiClient.ts` is the API contract.

## Running

From the repo root:

```sh
npm install
cp apps/mobile/example.env apps/mobile/.env
npm run dev:mobile
npm --workspace @ferry/mobile run ios      # development build on a connected iPhone
```

Tests: `npm --workspace @ferry/mobile run test`. Types: `check-types`. Lint: `lint`.

Set `EXPO_PUBLIC_SEED_DEMO=true` in a dev build to run the whole UI with no backend and
no passkey.

## Environment

`example.env` is the template. Every `EXPO_PUBLIC_*` value ships in the bundle, so nothing
secret belongs there.

| Variable                                              | What it is                                          |
| ----------------------------------------------------- | --------------------------------------------------- |
| `EXPO_PUBLIC_{MAINNET,TESTNET}_BACKEND_URL`           | The isolated Ferry API for each network             |
| `EXPO_PUBLIC_{MAINNET,TESTNET}_MONAD_RPC_URL`         | Keyless Monad endpoints for fallback balance reads  |
| `EXPO_PUBLIC_{MAINNET,TESTNET}_AUSD_ADDRESS`          | The AUSD contract on each chain                     |
| `EXPO_PUBLIC_{MAINNET,TESTNET}_FLOW_CONTRACT_ADDRESS` | Optional audited FerryFlow deployment on each chain |
| `EXPO_PUBLIC_{MAINNET,TESTNET}_EXPLORER_URL`          | MonadScan for each chain                            |
| `EXPO_PUBLIC_DISABLE_APP_LOCK`                        | Dev only: skip the biometric app lock               |
| `EXPO_PUBLIC_SEED_DEMO`                               | Dev only: the seeded UI                             |

The passkey relying party is `ferry.money`, fixed in `app.json` and read by `lib/mera/config.ts`.
Changing it would orphan every account.
