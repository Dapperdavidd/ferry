import { primaryPasskeyAction, secondaryPasskeyAction } from "../authEntry";

const remembered = {
  address: "0x0000000000000000000000000000000000000001" as const,
  credentialId: "credential",
};

describe("passkey entry actions", () => {
  it("recovers an existing passkey after reinstall instead of creating an account", () => {
    expect(primaryPasskeyAction(null)).toBe("signIn");
    expect(secondaryPasskeyAction(null)).toBe("create");
  });

  it("pins a remembered passkey for normal unlock", () => {
    expect(primaryPasskeyAction(remembered)).toBe("signIn");
    expect(secondaryPasskeyAction(remembered)).toBe("choose");
  });

  it("resumes an interrupted registration without making another passkey", () => {
    expect(
      primaryPasskeyAction({ ...remembered, registrationPending: true })
    ).toBe("resume");
  });
});
