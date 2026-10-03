import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

/** An error the app can act on: a stable code and a sentence a person can read. */
export class ApiError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super(
      { code, message, ...(details !== undefined ? { details } : {}) },
      status,
    );
  }
}

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === "object" && body !== null && "code" in body
          ? body
          : {
              code: codeFor(status),
              message: typeof body === "string" ? body : messageOf(body),
            };
      res.status(status).json(payload);
      return;
    }
    this.logger.error(
      `unhandled ${(exception as Error)?.stack ?? String(exception)}`,
    );
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ code: "INTERNAL", message: "Something went wrong." });
  }
}

function codeFor(status: number): string {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  return "REQUEST_FAILED";
}

function messageOf(body: unknown): string {
  const m = (body as { message?: unknown })?.message;
  if (Array.isArray(m)) return m.join("; ");
  return typeof m === "string" ? m : "Request failed.";
}
