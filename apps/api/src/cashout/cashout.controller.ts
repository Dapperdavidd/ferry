import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Hex } from "viem";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SubmitSchema, type SubmitRequest } from "../transfers/dtos";
import { CashoutService } from "./cashout.service";
import { PrepareCashoutSchema, QuoteSchema, type QuoteRequest } from "./dtos";

@Controller("cashout")
@UseGuards(AuthGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class CashoutController {
  constructor(private readonly cashout: CashoutService) {}

  @Post("quote")
  @HttpCode(200)
  quote(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(QuoteSchema)) body: QuoteRequest,
  ) {
    return this.cashout.quote(principal.address, body);
  }

  @Post("prepare")
  @HttpCode(200)
  prepare(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(PrepareCashoutSchema))
    body: { quoteId: string },
  ) {
    return this.cashout.prepare(
      principal.userId,
      principal.address,
      body.quoteId,
    );
  }

  @Post("submit")
  @HttpCode(200)
  submit(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(SubmitSchema)) body: SubmitRequest,
  ) {
    return this.cashout.submit(
      principal.userId,
      principal.address,
      body.intentId,
      body.signature as Hex,
    );
  }
}
