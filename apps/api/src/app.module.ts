import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AgoraModule } from "./agora/agora.module";
import { AuthModule } from "./auth/auth.module";
import { CashoutModule } from "./cashout/cashout.module";
import { FxModule } from "./fx/fx.module";
import { ChainModule } from "./chain/chain.module";
import { ErrorEnvelopeFilter } from "./common/errors";
import { ConfigModule } from "./config/config.module";
import { DbModule } from "./db/db.module";
import { HealthModule } from "./health/health.module";
import { IndexerModule } from "./indexer/indexer.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { TransfersModule } from "./transfers/transfers.module";
import { UsersModule } from "./users/users.module";
import { WalletModule } from "./wallet/wallet.module";
import { PayoutModule } from "./payout/payout.module";
import { FlowsModule } from "./flows/flows.module";
import { RelayerPolicyModule } from "./relayer/relayer-policy.module";
import { RewardsModule } from "./rewards/rewards.module";

@Module({
  imports: [
    ConfigModule,
    DbModule,
    RelayerPolicyModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    HealthModule,
    ChainModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    WalletModule,
    TransfersModule,
    IndexerModule,
    FxModule,
    CashoutModule,
    PayoutModule,
    AgoraModule,
    FlowsModule,
    RewardsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
  ],
})
export class AppModule {}
