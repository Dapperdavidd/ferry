import type { TypedData } from "@/utils/apiClient";

/**
 * What the app is about to sign must say exactly what the ticket showed. Checked field by
 * field before Face ID, whatever the server sent; a mismatch is never signed.
 */
export function checkAuthorization(
  typedData: TypedData,
  expected: {
    from: string;
    to: string;
    amountRaw: string;
    token: string;
    chainId: number;
    primaryType?: string;
  }
): string | null {
  const message = typedData.message as Record<string, unknown>;
  const domain = typedData.domain as Record<string, unknown>;
  if (
    typedData.primaryType !==
    (expected.primaryType ?? "TransferWithAuthorization")
  )
    return "wrong message type";
  if (
    String(domain.verifyingContract ?? "").toLowerCase() !==
    expected.token.toLowerCase()
  )
    return "wrong token";
  if (Number(domain.chainId) !== expected.chainId) return "wrong chain";
  if (String(message.from ?? "").toLowerCase() !== expected.from.toLowerCase())
    return "wrong sender";
  if (String(message.to ?? "").toLowerCase() !== expected.to.toLowerCase())
    return "wrong recipient";
  if (String(message.value ?? "") !== expected.amountRaw) return "wrong amount";
  return null;
}
