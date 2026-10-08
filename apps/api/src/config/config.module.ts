import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import * as Joi from "joi";

const address = Joi.string().pattern(/^0x[0-9a-fA-F]{40}$/);
const hexKey = Joi.string().pattern(/^0x[0-9a-fA-F]{64}$/);

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid("development", "production", "test")
          .required(),
        PORT: Joi.number().default(8000),
        TRUST_PROXY: Joi.alternatives()
          .try(Joi.boolean(), Joi.number().integer().min(0))
          .when("NODE_ENV", {
            is: "production",
            then: Joi.any().default(1),
            otherwise: Joi.any().default(false),
          }),
        DATABASE_URL: Joi.string().required(),
        DB_POOL_MAX: Joi.number().integer().min(1).default(10),

        JWT_SECRETS: Joi.string().min(16).required(),
        JWT_EXPIRES_IN: Joi.string().default("7d"),

        MONAD_CHAIN_ID: Joi.number().integer().valid(143, 10143).default(10143),
        MONAD_RPC_URLS: Joi.string().required(),
        EXPLORER_URL: Joi.string()
          .uri()
          .default("https://testnet.monadscan.com"),

        AUSD_ADDRESS: address.required(),
        AUSD_FAUCET_ADDRESS: address.optional().allow(""),
        // Settlement is an optional product rail. Core AUSD accounts and
        // transfers must still boot on mainnet before Ferry has a production
        // Agora pair and whitelist.
        CTK_ADDRESS: address.optional().allow(""),
        STABLE_SWAP_PAIR_ADDRESS: address.optional().allow(""),
        STABLE_SWAP_WHITELISTER_ADDRESS: address.optional().allow(""),
        SETTLEMENT_ADDRESS: address.optional().allow(""),
        FLOW_CONTRACT_ADDRESS: address.optional().allow(""),
        DROP_CONTRACT_ADDRESS: address.optional().allow(""),
        FLOW_DEPLOYMENT_BLOCK: Joi.string().pattern(/^\d+$/).default("0"),
        PAYOUT_PARTNER_ADDRESS: address.optional().allow(""),
        PAYOUT_PROVIDER: Joi.string()
          .valid("disabled", "yellowcard")
          .default("disabled"),
        PAYOUT_DATA_KEY: Joi.string()
          .pattern(/^[0-9a-fA-F]{64}$/)
          .optional()
          .allow(""),
        YELLOW_CARD_ENV: Joi.string()
          .valid("sandbox", "production")
          .default("sandbox"),
        YELLOW_CARD_API_KEY: Joi.string().when("PAYOUT_PROVIDER", {
          is: "yellowcard",
          then: Joi.required(),
          otherwise: Joi.optional().allow(""),
        }),
        YELLOW_CARD_API_SECRET: Joi.string().when("PAYOUT_PROVIDER", {
          is: "yellowcard",
          then: Joi.required(),
          otherwise: Joi.optional().allow(""),
        }),
        YELLOW_CARD_WEBHOOK_SECRET: Joi.string().optional().allow(""),
        YELLOW_CARD_BUSINESS_NAME: Joi.string().default("Ferry"),
        YELLOW_CARD_BUSINESS_ID: Joi.string().when("PAYOUT_PROVIDER", {
          is: "yellowcard",
          then: Joi.required(),
          otherwise: Joi.optional().allow(""),
        }),
        YELLOW_CARD_SEND_REASON: Joi.string().default("gift"),

        RELAYER_PRIVATE_KEY: hexKey.optional().allow(""),
        RELAYER_MAX_SENDS_PER_USER_PER_DAY: Joi.number()
          .integer()
          .min(1)
          .default(20),
        RELAYER_MAX_AMOUNT_PER_USER_PER_DAY_RAW: Joi.string()
          .pattern(/^\d+$/)
          .default("5000000000"),
        RELAYER_LOW_BALANCE_WEI: Joi.string()
          .pattern(/^\d+$/)
          .default("2000000000000000000"),

        FERRY_PLUS_TREASURY_ADDRESS: address.optional().allow(""),
        FERRY_PLUS_PRICE_RAW: Joi.string().pattern(/^\d+$/).default("9990000"),
        FERRY_PLUS_DURATION_DAYS: Joi.number()
          .integer()
          .min(1)
          .max(365)
          .default(30),
        FERRY_FREE_SPONSORED_SENDS: Joi.number()
          .integer()
          .min(0)
          .max(100)
          .default(5),
        FERRY_PLUS_SPONSORED_SENDS: Joi.number()
          .integer()
          .min(1)
          .max(1000)
          .default(50),

        AGORA_API_MODE: Joi.string().valid("live", "mock").default("mock"),
        AGORA_API_URL: Joi.string().uri().default("https://api.agora.finance"),
        AGORA_API_KEY: Joi.string().when("AGORA_API_MODE", {
          is: "live",
          then: Joi.required(),
          otherwise: Joi.optional().allow(""),
        }),

        FX_SOURCE: Joi.string().valid("table").default("table"),

        EXPO_ACCESS_TOKEN: Joi.string().optional().allow(""),
        CORS_ALLOWED_ORIGINS: Joi.string().optional().allow(""),
      }),
    }),
  ],
})
export class ConfigModule {}
