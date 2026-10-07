import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Hex } from "viem";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BillsService } from "./bills.service";
import {
  AddBillGroupMemberSchema,
  CreateBillGroupSchema,
  CreateBillSchema,
  ListBillsSchema,
  RespondInvitationSchema,
  SubmitBillPaymentSchema,
  type AddBillGroupMemberRequest,
  type CreateBillGroupRequest,
  type CreateBillRequest,
  type RespondInvitationRequest,
  type SubmitBillPaymentRequest,
} from "./dtos";

@Controller("bills")
@UseGuards(AuthGuard)
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query(new ZodValidationPipe(ListBillsSchema))
    query: { status: "all" | "open" | "settled" },
  ) {
    return this.bills.list(principal.userId, query.status);
  }

  @Post()
  create(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(CreateBillSchema)) body: CreateBillRequest,
  ) {
    return this.bills.create(principal.userId, body);
  }

  @Get(":id")
  get(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.bills.get(principal.userId, id);
  }

  @Post(":id/invitation")
  @HttpCode(200)
  respond(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RespondInvitationSchema))
    body: RespondInvitationRequest,
  ) {
    return this.bills.respond(principal.userId, id, body);
  }

  @Post(":id/remind")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  remind(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.bills.remind(principal.userId, id);
  }

  @Post(":id/payment/prepare")
  @HttpCode(200)
  preparePayment(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.bills.preparePayment(principal.userId, principal.address, id);
  }

  @Post(":id/payment/submit")
  @HttpCode(200)
  submitPayment(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SubmitBillPaymentSchema))
    body: SubmitBillPaymentRequest,
  ) {
    return this.bills.submitPayment(
      principal.userId,
      principal.address,
      id,
      body.intentId,
      body.signature as Hex,
    );
  }
}

@Controller("bill-groups")
@UseGuards(AuthGuard)
export class BillGroupsController {
  constructor(private readonly bills: BillsService) {}

  @Get()
  list(@CurrentUser() principal: Principal) {
    return this.bills.listGroups(principal.userId);
  }

  @Post()
  create(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(CreateBillGroupSchema))
    body: CreateBillGroupRequest,
  ) {
    return this.bills.createGroup(principal.userId, body);
  }

  @Get(":id")
  get(@CurrentUser() principal: Principal, @Param("id") id: string) {
    return this.bills.getGroup(principal.userId, id);
  }

  @Post(":id/members")
  addMember(
    @CurrentUser() principal: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AddBillGroupMemberSchema))
    body: AddBillGroupMemberRequest,
  ) {
    return this.bills.addGroupMember(principal.userId, id, body);
  }
}
