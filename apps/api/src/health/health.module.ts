import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController],
  providers: [HealthController],
  exports: [HealthController],
})
export class HealthModule {}
