import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FxModule } from "../fx/fx.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CashoutController } from "./cashout.controller";
import { CashoutService } from "./cashout.service";

@Module({
  imports: [AuthModule, FxModule, NotificationsModule],
  controllers: [CashoutController],
  providers: [CashoutService],
  exports: [CashoutService],
})
export class CashoutModule {}
