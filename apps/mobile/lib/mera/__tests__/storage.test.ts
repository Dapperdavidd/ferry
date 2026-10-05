import { loadAccount, saveAccount } from "../storage";

const getItemAsync = jest.fn();
const setItemAsync = jest.fn();
const deleteItemAsync = jest.fn();

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "when-unlocked-this-device-only",
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
}));

const account = {
  address: "0x0000000000000000000000000000000000000001" as const,
  credentialId: "credential_1",
};

describe("local passkey account storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("persists a pending registration so account creation can resume", async () => {
    await saveAccount({ ...account, registrationPending: true });

    expect(setItemAsync).toHaveBeenCalledWith(
      "ferry.account.v1",
      JSON.stringify({ ...account, registrationPending: true }),
      { keychainAccessible: "when-unlocked-this-device-only" }
    );
  });

  it("restores the pending-registration marker", async () => {
    getItemAsync.mockResolvedValueOnce(
      JSON.stringify({ ...account, registrationPending: true })
    );

    await expect(loadAccount()).resolves.toEqual({
      ...account,
      handle: undefined,
      registrationPending: true,
    });
  });

  it("keeps older stored accounts compatible", async () => {
    getItemAsync.mockResolvedValueOnce(JSON.stringify(account));

    await expect(loadAccount()).resolves.toEqual({
      ...account,
      handle: undefined,
      registrationPending: false,
    });
  });
});
