import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";

const RegisterDeviceSchema = z.object({
  token: z.string().min(1).max(200),
  platform: z.enum(["ios", "android"]),
});
const ForgetDeviceSchema = z.object({ token: z.string().min(1).max(200) });
const PreferenceSchema = z.object({ enabled: z.boolean() });

@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post("devices")
  async register(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(RegisterDeviceSchema))
    body: { token: string; platform: "ios" | "android" },
  ) {
    await this.notifications.registerDevice(
      principal.userId,
      body.token,
      body.platform,
    );
    return { ok: true };
  }

  @Delete("devices")
  async forget(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(ForgetDeviceSchema)) body: { token: string },
  ) {
    await this.notifications.forgetDevice(principal.userId, body.token);
    return { ok: true };
  }

  @Get("preferences")
  async get(@CurrentUser() principal: Principal) {
    return { enabled: await this.notifications.isEnabled(principal.userId) };
  }

  @Put("preferences")
  async set(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(PreferenceSchema)) body: { enabled: boolean },
  ) {
    await this.notifications.setEnabled(principal.userId, body.enabled);
    return { enabled: body.enabled };
  }
}
