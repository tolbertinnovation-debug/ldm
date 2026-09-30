/** Order lifecycle rules — pure, shared by server and UI. */
import type { OrderStatus } from "./constants";

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "PROCESSING", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"],
  PROCESSING: ["READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "READY", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedTransitions(status: OrderStatus, fulfillment: "DELIVERY" | "PICKUP"): OrderStatus[] {
  return TRANSITIONS[status].filter((s) => !(fulfillment === "PICKUP" && s === "OUT_FOR_DELIVERY"));
}

export function canTransition(from: OrderStatus, to: OrderStatus, fulfillment: "DELIVERY" | "PICKUP") {
  return allowedTransitions(from, fulfillment).includes(to);
}

/** Ordered steps shown on the customer tracking timeline. */
export function trackingSteps(fulfillment: "DELIVERY" | "PICKUP"): { status: OrderStatus; label: string }[] {
  return fulfillment === "DELIVERY"
    ? [
        { status: "PENDING", label: "Order placed" },
        { status: "CONFIRMED", label: "Confirmed" },
        { status: "PROCESSING", label: "Being prepared" },
        { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
        { status: "COMPLETED", label: "Delivered" },
      ]
    : [
        { status: "PENDING", label: "Order placed" },
        { status: "CONFIRMED", label: "Confirmed" },
        { status: "PROCESSING", label: "Being prepared" },
        { status: "READY", label: "Ready for pickup" },
        { status: "COMPLETED", label: "Picked up" },
      ];
}

const RANK: Record<OrderStatus, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PROCESSING: 2,
  READY: 3,
  OUT_FOR_DELIVERY: 3,
  COMPLETED: 4,
  CANCELLED: -1,
};

/** Index of the current step in `trackingSteps` (−1 when cancelled). */
export function currentStepIndex(status: OrderStatus) {
  return RANK[status];
}

export function paymentStatusFor(total: number, paid: number): "UNPAID" | "PARTIALLY_PAID" | "PAID" | "REFUNDED" {
  if (paid <= 0) return total <= 0 ? "PAID" : "UNPAID";
  if (paid >= total) return "PAID";
  return "PARTIALLY_PAID";
}
