import { Global, Module } from "@nestjs/common";
import { HealthModule } from "../health/health.module";
import { ChainService } from "./chain.service";
import { NetworkController } from "./network.controller";

@Global()
@Module({
  imports: [HealthModule],
  providers: [ChainService],
  controllers: [NetworkController],
  exports: [ChainService],
})
export class ChainModule {}
