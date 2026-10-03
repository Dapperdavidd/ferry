import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { correlationIdMiddleware } from "./common/correlation-id";
import { noStoreMiddleware, securityHeadersMiddleware } from "./common/headers";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.useBodyParser("json", { limit: "256kb" });
  const config = app.get(ConfigService);
  app.set("trust proxy", config.get<boolean | number>("TRUST_PROXY") ?? false);
  app.set("etag", false);
  app.use(correlationIdMiddleware);
  app.use(noStoreMiddleware);
  app.use(
    securityHeadersMiddleware({
      hsts: config.get<string>("NODE_ENV") === "production",
    }),
  );
  const origins = (config.get<string>("CORS_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length)
    app.enableCors({ origin: origins, exposedHeaders: ["X-Correlation-Id"] });
  app.enableShutdownHooks();
  const port = config.get<number>("PORT") ?? 8000;
  await app.listen(port);
  console.log(`Ferry API listening on ${port}`);
}
void bootstrap();
