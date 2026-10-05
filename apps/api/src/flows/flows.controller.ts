import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Hex } from "viem";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  PrepareFlowPaymentSchema,
  PrepareFlowSchema,
  SubmitFlowSchema,
  type PrepareFlowPaymentRequest,
  type PrepareFlowRequest,
  type SubmitFlowRequest,
} from "./dtos";
import { FlowsService } from "./flows.service";

@Controller("flows")
@UseGuards(AuthGuard)
export class FlowsController {
  constructor(private readonly flows: FlowsService) {}

  @Get("me")
  me(@CurrentUser() principal: Principal) {
    return this.flows.me(principal.userId);
  }

  @Post("prepare")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  prepare(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(PrepareFlowSchema)) body: PrepareFlowRequest,
  ) {
    return this.flows.prepareConfiguration(
      principal.userId,
      principal.address,
      body,
    );
  }

  @Post("submit")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  submit(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(SubmitFlowSchema)) body: SubmitFlowRequest,
  ) {
    return this.flows.submitConfiguration(
      principal.userId,
      principal.address,
      body.intentId,
      body.signature as Hex,
    );
  }

  @Post("payments/prepare")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  preparePayment(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(PrepareFlowPaymentSchema))
    body: PrepareFlowPaymentRequest,
  ) {
    return this.flows.preparePayment(principal.userId, principal.address, body);
  }

  @Post("payments/submit")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitPayment(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(SubmitFlowSchema)) body: SubmitFlowRequest,
  ) {
    return this.flows.submitPayment(
      principal.userId,
      principal.address,
      body.intentId,
      body.signature as Hex,
    );
  }
}
