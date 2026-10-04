import { Module } from "@nestjs/common";
import { AgoraModule } from "../agora/agora.module";
import { AuthModule } from "../auth/auth.module";
import { FxModule } from "../fx/fx.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { UsersModule } from "../users/users.module";
import { PayoutModule } from "../payout/payout.module";
import { CashoutController } from "./cashout.controller";
import { CashoutService } from "./cashout.service";
import { PayoutWebhookController } from "./payout-webhook.controller";

@Module({
  imports: [
    AuthModule,
    FxModule,
    NotificationsModule,
    AgoraModule,
    UsersModule,
    PayoutModule,
  ],
  controllers: [CashoutController, PayoutWebhookController],
  providers: [CashoutService],
  exports: [CashoutService],
})
export class CashoutModule {}
