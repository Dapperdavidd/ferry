import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getAddress, type Address } from "viem";
import { ApiError } from "../common/errors";
import { DbService } from "../db/db.service";
import { authChallenges } from "../db/schema";
import { UsersService } from "../users/users.service";
import {
  buildChallengeMessage,
  CHALLENGE_TTL_MS,
  signatureMatches,
} from "./auth.crypto";
import type { Principal } from "./principal";

interface TokenClaims {
  sub: string;
  address: Address;
}

@Injectable()
export class AuthService {
  private readonly secrets: string[];

  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    config: ConfigService,
  ) {
    this.secrets = config
      .getOrThrow<string>("JWT_SECRETS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async challenge(rawAddress: string) {
    const address = getAddress(rawAddress);
    const nonce = createId();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
    const message = buildChallengeMessage({
      address,
      nonce,
      issuedAt,
      expiresAt,
    });
    await this.db.client
      .insert(authChallenges)
      .values({ nonce, address, message, expiresAt });
    return { nonce, message, expiresAt: expiresAt.toISOString() };
  }

  /** The newest unused, unexpired challenge for the address must carry this signature. */
  async verify(rawAddress: string, signature: `0x${string}`) {
    const address = getAddress(rawAddress);
    const [challenge] = await this.db.client
      .select()
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.address, address),
          isNull(authChallenges.usedAt),
          gt(authChallenges.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(authChallenges.createdAt))
      .limit(1);
    if (!challenge)
      throw new ApiError(
        "CHALLENGE_EXPIRED",
        "Sign in took too long. Try again.",
        HttpStatus.UNAUTHORIZED,
      );
    if (
      !(await signatureMatches({
        address,
        message: challenge.message,
        signature,
      }))
    ) {
      throw new ApiError(
        "BAD_SIGNATURE",
        "That signature doesn't match this account.",
        HttpStatus.UNAUTHORIZED,
      );
    }
    const [claimed] = await this.db.client
      .update(authChallenges)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(authChallenges.nonce, challenge.nonce),
          isNull(authChallenges.usedAt),
        ),
      )
      .returning({ nonce: authChallenges.nonce });
    if (!claimed)
      throw new ApiError(
        "CHALLENGE_EXPIRED",
        "Sign in took too long. Try again.",
        HttpStatus.UNAUTHORIZED,
      );

    const { user, isNew } = await this.users.findOrCreateByAddress(address);
    const token = await this.jwt.signAsync(
      { sub: user.id, address: user.address as Address } satisfies TokenClaims,
      { secret: this.secrets[0] },
    );
    return { token, user: this.users.toView(user), isNew };
  }

  /** Any listed secret verifies, so a rotation never signs everyone out at once. */
  async principalFromToken(token: string): Promise<Principal | null> {
    for (const secret of this.secrets) {
      try {
        const claims = await this.jwt.verifyAsync<TokenClaims>(token, {
          secret,
        });
        if (
          typeof claims.sub !== "string" ||
          typeof claims.address !== "string"
        )
          return null;
        const user = await this.users.findActiveById(claims.sub);
        if (!user) return null;
        return { userId: user.id, address: user.address as Address };
      } catch {
        // try the next secret
      }
    }
    return null;
  }
}
