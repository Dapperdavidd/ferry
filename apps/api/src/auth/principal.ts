import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Address } from "viem";

export interface Principal {
  userId: string;
  address: Address;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest<{ principal?: Principal }>();
    if (!req.principal) throw new Error("CurrentUser used without AuthGuard");
    return req.principal;
  },
);
