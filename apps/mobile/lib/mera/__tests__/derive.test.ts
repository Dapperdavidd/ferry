import { deriveAccount, mnemonicFromPrf, zero } from "../derive";

// Mera's published vector. If this fails, addresses have changed and no user
// can reach their money: fix the derivation, never the expectation.
const PRF = new Uint8Array(Array.from({ length: 32 }, (_, i) => i + 1));
const ADDRESS = "0x50B240678777451BEfd67B7e8c3b4366482ba8F9";

describe("Mera derivation", () => {
  it("derives Mera's pinned address from the PRF vector", () => {
    const account = deriveAccount(PRF);
    expect(account.address).toBe(ADDRESS);
    expect(account.privateKey).toHaveLength(32);
    zero(account.privateKey);
    expect(account.privateKey.every((b) => b === 0)).toBe(true);
  });

  it("uses the PRF output as 24 words of BIP-39 entropy", () => {
    expect(mnemonicFromPrf(PRF).split(" ")).toHaveLength(24);
  });

  it("refuses anything but 32 bytes", () => {
    expect(() => deriveAccount(new Uint8Array(31))).toThrow("32 bytes");
  });

  it("gives a different account per index", () => {
    expect(deriveAccount(PRF, 1).address).not.toBe(ADDRESS);
  });
});
