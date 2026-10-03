import { BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodError, ZodSchema } from "zod";

export class ZodValidationPipe<T = unknown> implements PipeTransform<
  unknown,
  T
> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          code: "VALIDATION",
          message: "Validation failed",
          details: err.issues,
        });
      }
      throw err;
    }
  }
}
