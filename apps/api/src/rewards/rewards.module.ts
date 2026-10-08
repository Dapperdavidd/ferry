import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DbModule } from "../db/db.module";
import { RewardsController } from "./rewards.controller";
import { RewardsService } from "./rewards.service";
import { EventsModule } from "../events/events.module";

@Module({
  imports: [AuthModule, DbModule, EventsModule],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
