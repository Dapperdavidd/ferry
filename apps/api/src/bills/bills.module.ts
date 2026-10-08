import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TransfersModule } from "../transfers/transfers.module";
import { UsersModule } from "../users/users.module";
import { BillGroupsController, BillsController } from "./bills.controller";
import { BillsService } from "./bills.service";
import { EventsModule } from "../events/events.module";

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TransfersModule,
    NotificationsModule,
    EventsModule,
  ],
  controllers: [BillsController, BillGroupsController],
  providers: [BillsService],
  exports: [BillsService],
})
export class BillsModule {}
