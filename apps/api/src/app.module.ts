import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { ChainModule } from "./chain/chain.module";
import { ErrorEnvelopeFilter } from "./common/errors";
import { ConfigModule } from "./config/config.module";
import { DbModule } from "./db/db.module";
import { HealthModule } from "./health/health.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule,
    DbModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    HealthModule,
    ChainModule,
    AuthModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
  ],
})
export class AppModule {}
