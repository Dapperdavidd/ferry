import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillsModule } from "../bills/bills.module";
import { EventsModule } from "../events/events.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TransfersModule } from "../transfers/transfers.module";
import { UsersModule } from "../users/users.module";
import { PublicSocialController, SocialController } from "./social.controller";
import { SocialService } from "./social.service";

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TransfersModule,
    BillsModule,
    NotificationsModule,
    EventsModule,
  ],
  controllers: [PublicSocialController, SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
