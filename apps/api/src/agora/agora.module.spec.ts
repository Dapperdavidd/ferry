import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";
import { AGORA_CLIENT, type AgoraClient } from "./agora.client";
import { AgoraModule } from "./agora.module";
import { AgoraService } from "./agora.service";
import type { Metrics } from "./agora.types";

const METRICS: Metrics = {
  chains: [
    {
      chainId: "eip155:143",
      network: "monad",
      totalSupply: "2.000000",
      circulatingSupply: "2.000000",
    },
  ],
  partial: false,
  totalSupply: "3.000000",
  circulatingSupply: "3.000000",
};

describe("AgoraModule", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              AGORA_API_MODE: "mock",
              AGORA_API_URL: "https://agora.test",
            }),
          ],
        }),
        AgoraModule,
      ],
    })
      .overrideProvider(AGORA_CLIENT)
      .useValue({ metrics: () => Promise.resolve(METRICS) } as AgoraClient)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it("wires the service in the configured mode", () => {
    expect(app.get(AgoraService).mode).toBe("mock");
  });

  it("serves GET /agora/overview without a session", async () => {
    const res = await request(app.getHttpServer() as Server)
      .get("/agora/overview")
      .expect(200);
    expect(res.body as unknown).toEqual({
      mode: "mock",
      totalSupply: "3.000000",
      monadSupply: "2.000000",
      asOf: expect.any(String) as string,
    });
  });
});
