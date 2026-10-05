import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlusController } from "./plus.controller";
import { PlusService } from "./plus.service";

@Module({
  imports: [AuthModule],
  controllers: [PlusController],
  providers: [PlusService],
  exports: [PlusService],
})
export class PlusModule {}
