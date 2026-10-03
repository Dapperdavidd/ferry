import { Controller, Get } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AgoraService } from "./agora.service";

@Controller("agora")
export class AgoraController {
  constructor(private readonly agora: AgoraService) {}

  @Get("overview")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  overview() {
    return this.agora.overview();
  }
}
