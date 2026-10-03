import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { DbService } from "../db/db.service";

const CHECK_TIMEOUT_MS = 3000;
type CheckStatus = "ok" | "fail";

export interface HealthReport {
  status: CheckStatus;
  checks: Record<string, CheckStatus>;
}

export interface HealthProbe {
  name: string;
  run(): Promise<void>;
}

export const HEALTH_PROBES = Symbol("HealthProbes");

@Controller("health")
@SkipThrottle()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly probes: HealthProbe[] = [];

  constructor(private readonly db: DbService) {}

  register(probe: HealthProbe) {
    this.probes.push(probe);
  }

  @Get()
  async check(): Promise<HealthReport> {
    const entries = await Promise.all([
      this.probe("db", () => this.db.ping(CHECK_TIMEOUT_MS)),
      ...this.probes.map((p) => this.probe(p.name, () => p.run())),
    ]);
    const checks = Object.fromEntries(entries);
    const status: CheckStatus = Object.values(checks).every((s) => s === "ok")
      ? "ok"
      : "fail";
    const report = { status, checks };
    if (status !== "ok")
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }

  private async probe(
    name: string,
    run: () => Promise<void>,
  ): Promise<[string, CheckStatus]> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${name} timed out`)),
        CHECK_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([run(), timeout]);
      return [name, "ok"];
    } catch (err) {
      this.logger.error(
        `health.${name}.fail message=${(err as Error).message}`,
      );
      return [name, "fail"];
    } finally {
      clearTimeout(timer);
    }
  }
}
