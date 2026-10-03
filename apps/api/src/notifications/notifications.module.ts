import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { ExpoPushSender, PUSH_SENDER } from "./push-sender";

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: PUSH_SENDER, useClass: ExpoPushSender },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
