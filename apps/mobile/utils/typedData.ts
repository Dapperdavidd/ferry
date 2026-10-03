import type { TypedData } from "@/utils/apiClient";

/** The API sends uint fields as decimal strings; viem signs them as bigints. */
export function toSignable(typedData: TypedData) {
  const fields = typedData.types[typedData.primaryType] ?? [];
  const message: Record<string, unknown> = {};
  for (const field of fields) {
    const value = typedData.message[field.name];
    message[field.name] =
      /^u?int\d*$/.test(field.type) && typeof value === "string"
        ? BigInt(value)
        : value;
  }
  return {
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message,
  };
}
