export type CreateOrderActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; orderId: string };

export type UpdateOrderActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };
