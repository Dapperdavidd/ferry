import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { EventsQuerySchema, type EventsQuery } from "./dtos";
import { EventsService } from "./events.service";

@Controller("events")
@UseGuards(AuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  poll(
    @CurrentUser() principal: Principal,
    @Query(new ZodValidationPipe(EventsQuerySchema)) query: EventsQuery,
  ) {
    return this.events.poll(
      principal.userId,
      query.cursor,
      query.timeoutSeconds,
    );
  }
}
