import { Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PayoutNetworksQuerySchema, SavePayoutAccountSchema } from "./dtos";
import { PayoutService } from "./payout.service";

@Controller("payout")
@UseGuards(AuthGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class PayoutController {
  constructor(private readonly payout: PayoutService) {}

  @Get("networks")
  networks(
    @Query(new ZodValidationPipe(PayoutNetworksQuerySchema))
    query: {
      country: string;
      currency: string;
    },
  ) {
    return this.payout.networks(query.country, query.currency);
  }

  @Get("account")
  account(@CurrentUser() principal: Principal) {
    return this.payout.account(principal.userId);
  }

  @Put("account")
  save(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(SavePayoutAccountSchema))
    body: { networkId: string; accountNumber: string },
  ) {
    return this.payout.saveAccount(principal.userId, body);
  }
}
