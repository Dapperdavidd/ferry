import { Global, Module } from "@nestjs/common";
import { HealthModule } from "../health/health.module";
import { ChainService } from "./chain.service";

@Global()
@Module({
  imports: [HealthModule],
  providers: [ChainService],
  exports: [ChainService],
})
export class ChainModule {}
