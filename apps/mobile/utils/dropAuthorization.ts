import type { TypedData } from "@/utils/apiClient";

const CLAIM_FIELDS = [
  { name: "claimHash", type: "bytes32" },
  { name: "recipient", type: "address" },
  { name: "deadline", type: "uint256" },
];

export function checkDropClaim(
  typedData: TypedData,
  expected: {
    claimHash: string;
    recipient: string;
    chainId: number;
    verifyingContract: string;
    deadline: string;
  }
): string | null {
  const fields = typedData.types.Claim;
  const domain = typedData.domain as Record<string, unknown>;
  const message = typedData.message as Record<string, unknown>;
  if (typedData.primaryType !== "Claim") return "wrong message type";
  if (JSON.stringify(fields) !== JSON.stringify(CLAIM_FIELDS))
    return "wrong claim fields";
  if (String(domain.name) !== "FerryDrop" || String(domain.version) !== "1")
    return "wrong contract domain";
  if (Number(domain.chainId) !== expected.chainId) return "wrong chain";
  if (
    String(domain.verifyingContract ?? "").toLowerCase() !==
    expected.verifyingContract.toLowerCase()
  )
    return "wrong contract";
  if (
    String(message.claimHash ?? "").toLowerCase() !==
    expected.claimHash.toLowerCase()
  )
    return "wrong drop";
  if (
    String(message.recipient ?? "").toLowerCase() !==
    expected.recipient.toLowerCase()
  )
    return "wrong recipient";
  if (String(message.deadline ?? "") !== expected.deadline)
    return "wrong deadline";
  return null;
}
