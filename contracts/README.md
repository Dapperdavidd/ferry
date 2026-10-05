# Ferry contracts

`FerrySettlement` cashes AUSD out through Agora's Instant Settlement pool in one
transaction. The user signs an EIP-3009 `ReceiveWithAuthorization` naming the contract;
the nonce is `keccak256(payoutTo, minOut, salt)`, so the relayer that pays gas cannot
change where the output goes or how little is acceptable. The contract holds nothing
between calls and has no owner.

`FerryFlow` routes an incoming AUSD payment across up to five destinations. The shares
are basis points that must total 10,000, and any division dust goes to the last
destination. If the recipient has no active rule, the whole payment goes to them.

Rules are configured and disabled gaslessly with EIP-712 signatures under the
`FerryFlow` / `1` domain. Both operations use the recipient's shared, sequential
`configurationNonces(owner)` value and a deadline. The configure type is:

```text
ConfigureFlow(address owner,address[] destinations,uint256[] basisPoints,uint256 nonce,uint256 deadline)
DisableFlow(address owner,uint256 nonce,uint256 deadline)
```

The array fields follow EIP-712 array hashing: hash the concatenated 32-byte encodings
of their elements. Clients using a standard typed-data implementation such as viem can
sign the arrays directly.

An execution uses AUSD `ReceiveWithAuthorization` with `to` set to `FerryFlow`. Its
nonce must come from `authorizationNonceFor(owner, salt)`: the high 160 bits encode the
recipient and the low 96 bits are random. This prevents a relayer from selecting a
different recipient's rule after the payer signs. Indexers should build receipts from
`FlowExecuted` and `FlowDistribution`; they do not need to infer shares from ERC-20 log
ordering.

The relayer calls:

```text
executeFlow(owner,from,value,validAfter,validBefore,authNonce,v,r,s)
```

Signatures are canonical secp256k1 EOA signatures (`v` is 27 or 28 and `s` is low). Ferry's
current Mera passkey-derived accounts satisfy that assumption; ERC-1271 contract owners
are not supported by this MVP.

```sh
forge install foundry-rs/forge-std   # once; lib/ is not committed
forge fmt --check
forge build --sizes
forge test                           # includes fuzz/invariant tests and Monad fork tests
```

Deploy and whitelist (the pool only swaps for approved swappers; on testnet the whitelister
is self-service):

```sh
forge create src/FerrySettlement.sol:FerrySettlement --rpc-url monad_testnet --private-key $KEY --broadcast \
  --constructor-args 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC 0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae 0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D
cast send 0x7c10F56d6f04a51376393a1C3670e966863F6BD5 "setApprovedSwapper(address)" <deployed> --rpc-url monad_testnet --private-key $KEY
```

Deploy `FerryFlow` separately. It only needs the AUSD token address and does not require
the settlement-pool whitelist. `DeployFerryFlow.s.sol` is restricted to chain 10143 and
uses the canonical CREATE2 deployer, a versioned public salt and the fixed Monad-testnet
AUSD constructor argument. The resulting address is independent of the broadcaster. The
script also checks that AUSD has code and pins the CREATE2 deployer's runtime code hash. It
is safe to rerun once the expected contract exists.

First simulate against a current fork without a key:

```sh
forge script script/DeployFerryFlow.s.sol:DeployFerryFlow --rpc-url monad_testnet
```

With the current compiler settings and source, the predicted address is
`0x77b0662bD04798E9982A2df4547929f6B0a46659`. Confirm that the dry run prints this address,
then fund a dedicated deployer with testnet MON and broadcast. The key stays in the shell;
it is never read from a file or committed:

```sh
forge script script/DeployFerryFlow.s.sol:DeployFerryFlow --rpc-url monad_testnet \
  --private-key "$FERRY_FLOW_DEPLOYER_KEY" --broadcast --slow
```

Record the transaction hash, deployed address and deployment block. Configure the address
as `FLOW_CONTRACT_ADDRESS` on the API and `EXPO_PUBLIC_FLOW_CONTRACT_ADDRESS` in mobile;
configure the block as `FLOW_DEPLOYMENT_BLOCK` on the API so event recovery stays bounded.
Both clients must use chain id 10143 and the same address before Flow sends are enabled.

The API indexer ABI must retain these exact event signatures and indexed fields:

```text
FlowConfigured(address indexed owner,uint256 indexed nonce,address[] destinations,uint256[] basisPoints)
FlowDisabled(address indexed owner,uint256 indexed nonce)
FlowExecuted(address indexed owner,address indexed from,uint256 value,bytes32 indexed authorizationNonce,uint256 destinationCount)
FlowDistribution(address indexed owner,bytes32 indexed authorizationNonce,address indexed destination,uint256 amount,uint256 destinationIndex)
```

`FlowDistribution` is authoritative for per-destination receipts, including zero-value
rounding allocations. `FlowExecuted.destinationCount == 0` identifies the owner fallback;
that execution still emits one `FlowDistribution` to the owner.
