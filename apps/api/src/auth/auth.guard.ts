import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../common/errors";
import { AuthService } from "./auth.service";
import type { Principal } from "./principal";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { principal?: Principal }>();
    const header = req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token)
      throw new ApiError(
        "UNAUTHORIZED",
        "Sign in to continue.",
        HttpStatus.UNAUTHORIZED,
      );
    const principal = await this.auth.principalFromToken(token);
    if (!principal)
      throw new ApiError(
        "SESSION_EXPIRED",
        "Your session expired. Sign in again.",
        HttpStatus.UNAUTHORIZED,
      );
    req.principal = principal;
    return true;
  }
}
