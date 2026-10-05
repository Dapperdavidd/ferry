# Ferry mainnet launch

Ferry's public product runs on Monad mainnet. Testnet is a QA environment and
must never be presented as a production balance or payment rail.

## Canonical network

- Chain: Monad mainnet (`143`)
- Public RPCs: `https://rpc.monad.xyz`, `https://rpc1.monad.xyz`
- Explorer: `https://monadscan.com`
- AUSD: `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`
- AUSD EIP-712 domain: `Agora Dollar`, version `1`, chain `143`

Sources:

- <https://docs.monad.xyz/developer-essentials/network-information>
- <https://docs.agora.finance/developer/contract-deployments>

## Release gates

1. **Infrastructure** — provision production Postgres, apply every Drizzle
   migration, configure two RPC providers, rotate JWT secrets, and fund a
   dedicated mainnet relayer with MON.
2. **Core money movement** — verify passkey recovery, AUSD balance reads,
   ERC-3009 authorization, idempotent relaying, indexer reconciliation, and
   push notifications using low-value mainnet transfers.
3. **Ferry Flow** — audit the contract, run the mainnet fork suite, deploy with
   `DeployFerryFlowMainnet.s.sol`, verify source, then set the same address in
   API and mobile configuration.
4. **Funding** — remove the faucet from the mainnet product. Direct AUSD receive
   is available immediately; cross-chain USDC funding stays hidden until Agora
   production API access and a full deposit/reconciliation test pass.
5. **Bank payout** — keep Ferry Direct hidden until KYB, live rate quoting,
   beneficiary verification, webhook signature validation, sandbox payout,
   production payout, reversal handling, and treasury reconciliation all pass.
6. **Store release** — build from the mainnet environment, confirm the app and
   API use chain `143`, run the physical-device matrix, then ship to TestFlight
   before App Store review.

## Mainnet deployment commands

Dry-run the Flow deployment on a mainnet fork first:

```sh
cd contracts
forge test --fork-url monad_mainnet
forge script script/DeployFerryFlowMainnet.s.sol:DeployFerryFlowMainnet \
  --rpc-url monad_mainnet
```

Only after the predicted address, bytecode, audit result, and deployer balance
have been reviewed should the same command be run with `--broadcast`.

## What may launch first

The safe first public release is passkey accounts, AUSD receive, gas-sponsored
AUSD send, live balances, and activity. Flows can follow after deployment.
USDC funding and bank payouts are separate provider launches and must not be
represented as live until their production credentials and operational runbooks
are complete.
