export const ferryDropAbi = [
  {
    type: "function",
    name: "createDrop",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claimHash", type: "bytes32" },
      { name: "sender", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "expiresAt", type: "uint64" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "authorizationNonce", type: "bytes32" },
      { name: "authorizationSignature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "secret", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimHash", type: "bytes32" }],
    outputs: [],
  },
] as const;
