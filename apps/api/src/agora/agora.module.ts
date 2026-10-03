import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AGORA_CLIENT, type AgoraClient } from "./agora.client";
import { AgoraController } from "./agora.controller";
import { LiveAgoraClient } from "./agora.live-client";
import { MockAgoraClient } from "./agora.mock-client";
import { AgoraService } from "./agora.service";

export function createAgoraClient(config: ConfigService): AgoraClient {
  const baseUrl = config.getOrThrow<string>("AGORA_API_URL");
  if (config.get<string>("AGORA_API_MODE") === "live") {
    new Logger("Agora").log(`live client ${baseUrl}`);
    return new LiveAgoraClient({
      baseUrl,
      apiKey: config.getOrThrow<string>("AGORA_API_KEY"),
    });
  }
  new Logger("Agora").log(`mock client; metrics still read from ${baseUrl}`);
  return new MockAgoraClient(new LiveAgoraClient({ baseUrl, apiKey: null }));
}

@Module({
  controllers: [AgoraController],
  providers: [
    {
      provide: AGORA_CLIENT,
      inject: [ConfigService],
      useFactory: createAgoraClient,
    },
    AgoraService,
  ],
  exports: [AgoraService, AGORA_CLIENT],
})
export class AgoraModule {}
