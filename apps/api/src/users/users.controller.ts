import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, type Principal } from "../auth/principal";
import { ApiError } from "../common/errors";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  HandleQuerySchema,
  UpdateMeSchema,
  type UpdateMeRequest,
} from "./dtos";
import { UsersService } from "./users.service";

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser() principal: Principal) {
    const user = await this.users.findActiveById(principal.userId);
    if (!user)
      throw new ApiError(
        "NOT_FOUND",
        "Account not found.",
        HttpStatus.NOT_FOUND,
      );
    return this.users.toView(user);
  }

  @Put()
  async update(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(UpdateMeSchema)) body: UpdateMeRequest,
  ) {
    return this.users.toView(await this.users.update(principal.userId, body));
  }

  @Delete()
  async remove(@CurrentUser() principal: Principal) {
    await this.users.softDelete(principal.userId);
    return { deleted: true };
  }
}

/** Public lookups, rate-limited so the directory can't be scraped. */
@Controller("directory")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class DirectoryController {
  constructor(private readonly users: UsersService) {}

  @Get("available")
  available(
    @Query(new ZodValidationPipe(HandleQuerySchema)) query: { handle: string },
  ) {
    return this.users.handleAvailability(query.handle);
  }

  @Get("resolve")
  async resolve(
    @Query(new ZodValidationPipe(HandleQuerySchema)) query: { handle: string },
  ) {
    const user = await this.users.findByHandle(query.handle);
    if (!user?.handle)
      throw new ApiError(
        "DIRECTORY_NOT_FOUND",
        `No one on Ferry is @${query.handle}.`,
        HttpStatus.NOT_FOUND,
      );
    return {
      address: user.address,
      handle: user.handle,
      displayName: user.displayName,
      homeCurrency: user.homeCurrency,
      country: user.country,
      payoutReady: Boolean(user.payoutAccount),
      payoutBank: user.payoutAccount?.bankName ?? null,
      payoutAccountEnding: user.payoutAccount?.accountEnding ?? null,
    };
  }
}
