# Ferry contracts

`FerrySettlement` cashes AUSD out through Agora's Instant Settlement pool in one
transaction. The user signs an EIP-3009 `ReceiveWithAuthorization` naming the contract;
the nonce is `keccak256(payoutTo, minOut, salt)`, so the relayer that pays gas cannot
change where the output goes or how little is acceptable. The contract holds nothing
between calls and has no owner.

```sh
forge install foundry-rs/forge-std   # once; lib/ is not committed
forge test                           # forks Monad testnet, where AUSD and the pool are live
```

Deploy and whitelist (the pool only swaps for approved swappers; on testnet the whitelister
is self-service):

```sh
forge create src/FerrySettlement.sol:FerrySettlement --rpc-url monad_testnet --private-key $KEY --broadcast \
  --constructor-args 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC 0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae 0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D
cast send 0x7c10F56d6f04a51376393a1C3670e966863F6BD5 "setApprovedSwapper(address)" <deployed> --rpc-url monad_testnet --private-key $KEY
```
