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
import type { Hex } from "viem";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  ListQuerySchema,
  PrepareTransferSchema,
  SubmitSchema,
  type PrepareTransferRequest,
  type SubmitRequest,
} from "./dtos";
import { TransfersService } from "./transfers.service";

@Controller("transfers")
@UseGuards(AuthGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post("prepare")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  prepare(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(PrepareTransferSchema))
    body: PrepareTransferRequest,
  ) {
    return this.transfers.prepare(principal.userId, principal.address, body);
  }

  @Post("submit")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submit(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(SubmitSchema)) body: SubmitRequest,
  ) {
    return this.transfers.submit(
      principal.userId,
      principal.address,
      body.intentId,
      body.signature as Hex,
    );
  }

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query(new ZodValidationPipe(ListQuerySchema))
    query: { cursor?: string; limit: number },
  ) {
    return this.transfers.list(principal.userId, query);
  }
}
