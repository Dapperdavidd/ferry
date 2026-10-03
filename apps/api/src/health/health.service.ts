import { Injectable } from "@nestjs/common";

export interface HealthProbe {
  name: string;
  run(): Promise<void>;
}

@Injectable()
export class HealthService {
  readonly probes: HealthProbe[] = [];

  register(probe: HealthProbe) {
    this.probes.push(probe);
  }
}
