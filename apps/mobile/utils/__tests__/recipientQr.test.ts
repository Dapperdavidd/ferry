import { ferryPayLink, parseRecipient } from "../recipientQr";

const address = "0x1234567890abcdef1234567890abcdef12345678";

describe("recipient QR links", () => {
  it("keeps wallet QRs interoperable", () => {
    expect(parseRecipient(address)).toEqual({
      kind: "address",
      value: address,
    });
    expect(parseRecipient(`ethereum:${address}@143`, 143)).toEqual({
      kind: "address",
      value: address,
    });
    expect(parseRecipient(`ethereum:${address}@10143`, 143)).toBeNull();
  });

  it("opens Ferry payment links without changing the recipient", () => {
    expect(parseRecipient(ferryPayLink(address))).toEqual({
      kind: "address",
      value: address,
    });
    expect(parseRecipient("ferry://pay?to=%40ada")).toEqual({
      kind: "handle",
      value: "ada",
    });
  });

  it("rejects foreign sites and transaction requests", () => {
    expect(parseRecipient(`https://evil.example/pay?to=${address}`)).toBeNull();
    expect(
      parseRecipient(`ethereum:${address}@143/transfer?address=${address}`, 143)
    ).toBeNull();
    expect(parseRecipient("ferry://pay?to=%ZZ")).toBeNull();
  });
});
