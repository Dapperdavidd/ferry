import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { CashoutService } from "./cashout.service";

@Controller("payout/webhook")
export class PayoutWebhookController {
  constructor(private readonly cashout: CashoutService) {}

  @Post("yellow-card")
  @HttpCode(200)
  async yellowCard(
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-yc-signature") signature: string | undefined,
    @Body() body: unknown,
  ) {
    if (!request.rawBody || !signature)
      throw new UnauthorizedException("Missing webhook signature.");
    return this.cashout.handlePayoutWebhook(request.rawBody, signature, body);
  }
}
