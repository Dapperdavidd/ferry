import { z } from "zod";

export const EventsQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  timeoutSeconds: z.coerce.number().int().min(0).max(25).default(20),
});

export type EventsQuery = z.infer<typeof EventsQuerySchema>;
