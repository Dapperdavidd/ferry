import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { FLOW_RELAYER, ViemFlowRelayer } from "./flow-relayer";
import { FlowOperationsService } from "./flow-operations.service";
import { FlowsController } from "./flows.controller";
import { FlowsService } from "./flows.service";

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [FlowsController],
  providers: [
    FlowsService,
    FlowOperationsService,
    { provide: FLOW_RELAYER, useClass: ViemFlowRelayer },
  ],
  exports: [FlowsService, FlowOperationsService],
})
export class FlowsModule {}
