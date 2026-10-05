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
import { SubmitSchema, type SubmitRequest } from "../transfers/dtos";
import { PlusService } from "./plus.service";

@Controller("plus")
@UseGuards(AuthGuard)
export class PlusController {
  constructor(private readonly plus: PlusService) {}

  @Get()
  me(@CurrentUser() principal: Principal) {
    return this.plus.me(principal.userId);
  }

  @Post("prepare")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  prepare(@CurrentUser() principal: Principal) {
    return this.plus.prepare(principal.userId, principal.address);
  }

  @Post("submit")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submit(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(SubmitSchema)) body: SubmitRequest,
  ) {
    return this.plus.submit(
      principal.userId,
      principal.address,
      body.intentId,
      body.signature as Hex,
    );
  }
}
