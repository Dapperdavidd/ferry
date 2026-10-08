import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Hex } from "viem";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  ClaimTableItemSchema,
  CreatePaymentRequestSchema,
  CreateRecurringBillSchema,
  CreateTableSchema,
  SetRecurringStateSchema,
  SubmitSocialPaymentSchema,
  type ClaimTableItem,
  type CreatePaymentRequest,
  type CreateRecurringBill,
  type CreateTable,
  type SetRecurringState,
  type SubmitSocialPayment,
} from "./dtos";
import { SocialService } from "./social.service";

@Controller("public")
export class PublicSocialController {
  constructor(private readonly social: SocialService) {}

  @Get("payment-requests/:token")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  request(@Param("token") token: string) {
    return this.social.publicRequest(token);
  }

  @Get("tables/:token")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  table(@Param("token") token: string) {
    return this.social.tableByToken(token, null);
  }
}

@Controller()
@UseGuards(AuthGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get("payment-requests")
  listRequests(@CurrentUser() principal: Principal) {
    return this.social.listRequests(principal.userId);
  }

  @Post("payment-requests")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createRequest(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(CreatePaymentRequestSchema))
    body: CreatePaymentRequest,
  ) {
    return this.social.createRequest(principal.userId, body);
  }

  @Post("payment-requests/:id/prepare")
  @HttpCode(200)
  prepareRequest(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.social.prepareRequest(principal.userId, principal.address, id);
  }

  @Post("payment-requests/:id/submit")
  @HttpCode(200)
  submitRequest(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SubmitSocialPaymentSchema))
    body: SubmitSocialPayment,
  ) {
    return this.social.submitRequest(
      principal.userId,
      principal.address,
      id,
      body.intentId,
      body.signature as Hex,
    );
  }

  @Get("recurring-bills")
  listRecurring(@CurrentUser() principal: Principal) {
    return this.social.listRecurring(principal.userId);
  }

  @Post("recurring-bills")
  createRecurring(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(CreateRecurringBillSchema))
    body: CreateRecurringBill,
  ) {
    return this.social.createRecurring(principal.userId, body);
  }

  @Patch("recurring-bills/:id")
  setRecurringState(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SetRecurringStateSchema))
    body: SetRecurringState,
  ) {
    return this.social.setRecurringState(principal.userId, id, body);
  }

  @Post("bill-groups/:groupId/settlements")
  createSettlement(
    @CurrentUser() principal: Principal,
    @Param("groupId") groupId: string,
  ) {
    return this.social.createSettlement(principal.userId, groupId);
  }

  @Get("settlements/:id")
  getSettlement(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.social.getSettlement(principal.userId, id);
  }

  @Post("settlements/:id/legs/:legId/prepare")
  @HttpCode(200)
  prepareSettlement(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Param("legId") legId: string,
  ) {
    return this.social.prepareSettlementLeg(
      principal.userId,
      principal.address,
      id,
      legId,
    );
  }

  @Post("settlements/:id/legs/:legId/submit")
  @HttpCode(200)
  submitSettlement(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Param("legId") legId: string,
    @Body(new ZodValidationPipe(SubmitSocialPaymentSchema))
    body: SubmitSocialPayment,
  ) {
    return this.social.submitSettlementLeg(
      principal.userId,
      principal.address,
      id,
      legId,
      body.intentId,
      body.signature as Hex,
    );
  }

  @Get("tables")
  listTables(@CurrentUser() principal: Principal) {
    return this.social.listTables(principal.userId);
  }

  @Post("tables")
  createTable(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(CreateTableSchema)) body: CreateTable,
  ) {
    return this.social.createTable(principal.userId, body);
  }

  @Post("tables/join/:token")
  @HttpCode(200)
  joinTable(
    @CurrentUser() principal: Principal,
    @Param("token") token: string,
  ) {
    return this.social.joinTable(principal.userId, token);
  }

  @Get("tables/:id")
  getTable(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.social.getTable(principal.userId, id);
  }

  @Patch("tables/:id/items/:itemId/claim")
  claimItem(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(ClaimTableItemSchema)) body: ClaimTableItem,
  ) {
    return this.social.claimTableItem(principal.userId, id, itemId, body);
  }

  @Post("tables/:id/finalize")
  @HttpCode(200)
  finalizeTable(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.social.finalizeTable(principal.userId, id);
  }
}
