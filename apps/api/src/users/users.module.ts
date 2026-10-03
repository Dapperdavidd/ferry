import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DirectoryController, MeController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [MeController, DirectoryController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
