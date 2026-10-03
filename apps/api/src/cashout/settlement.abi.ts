import { parseAbi } from "viem";

export const settlementAbi = parseAbi([
  "function settle(address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature, address payoutTo, uint256 minOut, bytes32 salt, uint256 deadline) returns (uint256 amountOut)",
  "function nonceFor(address payoutTo, uint256 minOut, bytes32 salt) pure returns (bytes32)",
  "event Settled(address indexed from, address indexed payoutTo, uint256 amountIn, uint256 amountOut, bytes32 nonce)",
  "error TermsMismatch()",
]);
