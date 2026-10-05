import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApplyReferralSchema, type ApplyReferralRequest } from "./dtos";
import { RewardsService } from "./rewards.service";

@Controller("rewards")
@UseGuards(AuthGuard)
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get("me")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  me(@CurrentUser() principal: Principal) {
    return this.rewards.me(principal.userId);
  }

  @Post("referral")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  applyReferral(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(ApplyReferralSchema))
    body: ApplyReferralRequest,
  ) {
    return this.rewards.applyReferral(principal.userId, body.code);
  }
}
