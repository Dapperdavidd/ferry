import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PayoutController } from "./payout.controller";
import { PayoutService } from "./payout.service";
import { YellowCardClient } from "./yellow-card.client";

@Module({
  imports: [AuthModule],
  controllers: [PayoutController],
  providers: [PayoutService, YellowCardClient],
  exports: [PayoutService],
})
export class PayoutModule {}
