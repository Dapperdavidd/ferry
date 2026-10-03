import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { WalletService } from "./wallet.service";

@Controller("wallet")
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get("balances")
  balances(@CurrentUser() principal: Principal) {
    return this.wallet.balances(principal.address);
  }

  @Post("fund")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  fund(@CurrentUser() principal: Principal) {
    return this.wallet.fund(principal.userId, principal.address);
  }
}
