import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DbModule } from "../db/db.module";
import { RewardsController } from "./rewards.controller";
import { RewardsService } from "./rewards.service";

@Module({
  imports: [AuthModule, DbModule],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
