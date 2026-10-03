import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { UsersModule } from "../users/users.module";
import { IndexerService } from "./indexer.service";

@Module({
  imports: [UsersModule, NotificationsModule],
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerModule {}
