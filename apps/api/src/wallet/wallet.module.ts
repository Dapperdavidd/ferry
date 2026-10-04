import { Module } from "@nestjs/common";
import { AgoraModule } from "../agora/agora.module";
import { AuthModule } from "../auth/auth.module";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";

@Module({
  imports: [AuthModule, AgoraModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
