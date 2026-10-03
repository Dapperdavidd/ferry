import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { ChallengeQuerySchema, VerifySchema, type VerifyRequest } from "./dtos";

@Controller("auth")
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("challenge")
  challenge(
    @Query(new ZodValidationPipe(ChallengeQuerySchema))
    query: {
      address: string;
    },
  ) {
    return this.auth.challenge(query.address);
  }

  @Post("verify")
  @HttpCode(200)
  verify(@Body(new ZodValidationPipe(VerifySchema)) body: VerifyRequest) {
    return this.auth.verify(body.address, body.signature as `0x${string}`);
  }

  /** Sessions are stateless tokens; the app forgets its copy. Kept so the app has one place to call. */
  @Post("signout")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  signOut() {
    return { ok: true };
  }
}
