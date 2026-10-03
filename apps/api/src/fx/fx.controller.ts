import { Controller, Get, HttpStatus, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { ApiError } from "../common/errors";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FxService } from "./fx.service";

const FxQuerySchema = z.object({
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "A three-letter currency code.")
    .transform((code) => code.toUpperCase()),
});

/**
 * Display rates, public and cheap: the home screen shows a balance in the
 * account's home currency before anyone has asked for a cash-out quote.
 */
@Controller("fx")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get("quote")
  quote(
    @Query(new ZodValidationPipe(FxQuerySchema))
    query: z.infer<typeof FxQuerySchema>,
  ) {
    const quote = this.fx.quote(query.currency);
    if (!quote)
      throw new ApiError(
        "UNSUPPORTED_CURRENCY",
        `No rate for ${query.currency}.`,
        HttpStatus.NOT_FOUND,
      );
    return quote;
  }
}
