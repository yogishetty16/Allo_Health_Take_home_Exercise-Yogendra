import { z } from "zod";

export const reservationCreateSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().max(1000)
});

export const reservationIdSchema = z.string().uuid();

export type ReservationCreateInput = z.infer<typeof reservationCreateSchema>;
