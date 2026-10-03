import type { NextFunction, Request, Response } from "express";

export function noStoreMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
}

export function securityHeadersMiddleware(options: { hsts: boolean }) {
  return function securityHeaders(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (options.hsts)
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    next();
  };
}
