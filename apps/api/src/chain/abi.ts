import { parseAbi } from "viem";

/** The slice of Agora's AUSD we call. The overloads taking `bytes signature` are the ones used. */
export const ausdAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function isAccountFrozen(address account) view returns (bool)",
  "function isTransferPaused() view returns (bool)",
  "function isSignatureVerificationPaused() view returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "error TransferPaused()",
  "error AccountIsFrozen(address frozenAccount)",
  "error SignatureVerificationPaused()",
]);

export const faucetAbi = parseAbi([
  "function requestFunds(address recipient)",
  "function faucetDripAmount() view returns (uint256)",
  "function maxDripFrequency() view returns (uint256)",
  "function lastDripTimestamp(address) view returns (uint256)",
  "error MaxFrequencyExceeded()",
  "error MaxAllowedExceeded()",
]);

export const stableSwapPairAbi = parseAbi([
  "function name() view returns (string)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function reserve0() view returns (uint256)",
  "function reserve1() view returns (uint256)",
  "function getPrice() view returns (uint256)",
  "function token0PurchaseFee() view returns (uint256)",
  "function token1PurchaseFee() view returns (uint256)",
  "function isPaused() view returns (bool)",
  "function hasRole(string role, address account) view returns (bool)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
]);

export const whitelisterAbi = parseAbi([
  "function setApprovedSwapper(address account)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);
