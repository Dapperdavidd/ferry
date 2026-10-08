import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Hex } from "viem";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  ClaimDropSchema,
  CreateDropSchema,
  SubmitDropSchema,
  type ClaimDrop,
  type CreateDrop,
  type SubmitDrop,
} from "./dtos";
import { DropsService } from "./drops.service";

@Controller("public/drops")
export class PublicDropsController {
  constructor(private readonly drops: DropsService) {}

  @Get(":secret")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  get(@Param("secret") secret: string) {
    return this.drops.publicView(secret);
  }
}

@Controller("drops")
@UseGuards(AuthGuard)
export class DropsController {
  constructor(private readonly drops: DropsService) {}

  @Get()
  list(@CurrentUser() principal: Principal) {
    return this.drops.list(principal.userId);
  }

  @Post("prepare")
  @HttpCode(200)
  prepare(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(CreateDropSchema)) body: CreateDrop,
  ) {
    return this.drops.prepare(principal.userId, principal.address, body);
  }

  @Post(":id/submit")
  @HttpCode(200)
  submit(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SubmitDropSchema)) body: SubmitDrop,
  ) {
    return this.drops.submit(principal.userId, principal.address, id, body);
  }

  @Post("claim/:secret/prepare")
  @HttpCode(200)
  prepareClaim(
    @CurrentUser() principal: Principal,
    @Param("secret") secret: string,
  ) {
    return this.drops.prepareClaim(secret, principal.address);
  }

  @Post("claim/:secret")
  @HttpCode(200)
  claim(
    @CurrentUser() principal: Principal,
    @Param("secret") secret: string,
    @Body(new ZodValidationPipe(ClaimDropSchema)) body: ClaimDrop,
  ) {
    return this.drops.claim(principal.userId, principal.address, secret, {
      ...body,
      signature: body.signature as Hex,
    });
  }

  @Post(":id/refund")
  @HttpCode(200)
  refund(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.drops.refund(principal.userId, id);
  }
}
