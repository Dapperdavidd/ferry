import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RelayerPolicyModule } from "../relayer/relayer-policy.module";
import { DropsController, PublicDropsController } from "./drops.controller";
import { DropsService } from "./drops.service";

@Module({
  imports: [AuthModule, RelayerPolicyModule, EventsModule, NotificationsModule],
  controllers: [DropsController, PublicDropsController],
  providers: [DropsService],
})
export class DropsModule {}
