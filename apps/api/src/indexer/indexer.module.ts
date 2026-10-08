import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { RewardsModule } from "../rewards/rewards.module";
import { UsersModule } from "../users/users.module";
import { IndexerService } from "./indexer.service";
import { EventsModule } from "../events/events.module";

@Module({
  imports: [UsersModule, NotificationsModule, RewardsModule, EventsModule],
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerModule {}
