import { Global, Module } from "@nestjs/common";
import { RelayerPolicyService } from "./relayer-policy.service";

@Global()
@Module({
  providers: [RelayerPolicyService],
  exports: [RelayerPolicyService],
})
export class RelayerPolicyModule {}
