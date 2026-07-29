import type { MockOrder } from "./mock-orders";

export type ShipmentTrackingStatus =
  | "label_created"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "returned";

export interface SafeShipmentProjection {
  carrier?: string;
  service?: string;
  trackingNumber?: string;
  status?: ShipmentTrackingStatus;
  updatedAt?: string;
  updates?: {
    status?: ShipmentTrackingStatus;
    occurredAt?: string;
  }[];
}

export function trackingFields(order: {
  carrier?: string;
  trackingNumber?: string;
  shipment?: SafeShipmentProjection;
}): {
  carrier: string;
  service?: string;
  trackingNumber: string;
  shipmentStatus?: ShipmentTrackingStatus;
};

export function trackingSurfacePolicy(mode: "success" | "tracking"): {
  showCustomer: boolean;
  showItems: boolean;
  showPrices: boolean;
};

export function publicTrackingSearchParams(
  query: string,
  access?: string,
): string | null;

export function parsePublicTrackingInput(
  value: string,
  fallbackAccess?: string,
): { query: string; access: string } | null;

export function trackingTimeline(order: {
  statusHistory?: MockOrder["statusHistory"];
  shipment?: SafeShipmentProjection;
}): NonNullable<MockOrder["statusHistory"]>;
