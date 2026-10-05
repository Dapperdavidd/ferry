import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { AgoraService } from "../agora/agora.service";
import type { DbService } from "../db/db.service";
import type { UserRow, UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";

const account = privateKeyToAccount(generatePrivateKey());

async function setup(existing: UserRow | null) {
  const message = "Sign in to Ferry test";
  const signature = await account.signMessage({ message });
  const findOrCreateByAddress = jest.fn();
  const db = {
    client: {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => Promise.resolve([{ nonce: "nonce", message }]),
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([{ nonce: "nonce" }]),
          }),
        }),
      }),
    },
  } as unknown as DbService;
  const users = {
    findByAddress: jest.fn().mockResolvedValue(existing),
    findOrCreateByAddress,
    toView: (user: UserRow) => ({ id: user.id, address: user.address }),
  } as unknown as UsersService;
  const jwt = {
    signAsync: jest.fn().mockResolvedValue("token"),
  } as unknown as JwtService;
  const agora = {
    onboardWallet: jest.fn(),
  } as unknown as AgoraService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue("a-secure-jwt-secret"),
  } as unknown as ConfigService;

  return {
    service: new AuthService(db, jwt, users, agora, config),
    signature,
    findOrCreateByAddress,
  };
}

describe("AuthService account intent", () => {
  it("does not silently create an account during sign in", async () => {
    const { service, signature, findOrCreateByAddress } = await setup(null);

    await expect(
      service.verify(account.address, signature, "signIn"),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    expect(findOrCreateByAddress).not.toHaveBeenCalled();
  });

  it("uses an existing account during sign in", async () => {
    const user = {
      id: "user_1",
      address: account.address,
      deletedAt: null,
    } as UserRow;
    const { service, signature, findOrCreateByAddress } = await setup(user);

    const result = await service.verify(account.address, signature, "signIn");

    expect(result).toMatchObject({ token: "token", isNew: false });
    expect(findOrCreateByAddress).not.toHaveBeenCalled();
  });

  it("creates the network-local profile when connecting an existing passkey", async () => {
    const user = {
      id: "user_2",
      address: account.address,
      deletedAt: null,
    } as UserRow;
    const { service, signature, findOrCreateByAddress } = await setup(null);
    findOrCreateByAddress.mockResolvedValue({ user, isNew: true });

    const result = await service.verify(account.address, signature, "connect");

    expect(result).toMatchObject({ token: "token", isNew: true });
    expect(findOrCreateByAddress).toHaveBeenCalledWith(account.address);
  });
});
