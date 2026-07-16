import { formatEUR } from "@/lib/products";
import type { Product } from "@/lib/products";

const STRAPI_URL =
  process.env.STRAPI_URL ??
  process.env.NEXT_PUBLIC_STRAPI_URL ??
  "http://localhost:9014";
const ADMIN_API_SECRET = process.env.JAMORA_ADMIN_API_SECRET;

export type AdminOrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "fulfilled"
  | "failed"
  | "refunded";

export interface AdminOrderItem {
  productId?: string;
  sku?: string;
  slug?: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface OrderTimelineEvent {
  id: string;
  type: "status" | "note";
  status?: AdminOrderStatus;
  note?: string;
  actor?: string;
  createdAt: string;
}

export interface AdminOrder {
  documentId: string;
  orderNumber?: string;
  trackingNumber?: string;
  carrier?: string;
  customerName?: string;
  email?: string;
  status: AdminOrderStatus;
  currency?: string;
  subtotalCents?: number;
  shippingCents?: number;
  discountCents?: number;
  promotionCode?: string;
  totalCents?: number;
  estimatedProfitCents?: number;
  invoiceNumber?: string;
  items?: AdminOrderItem[];
  statusHistory?: OrderTimelineEvent[];
  reservationToken?: string;
  batchAllocations?: BatchAllocation[];
  fulfilmentChecklist?: FulfilmentChecklistItem[];
  packedBy?: string;
  packedAt?: string;
  itemsSummary?: string;
  shippingAddressText?: string;
  trackingPreviewUrl?: string;
  deliveryLabelUrl?: string;
  estimatedDelivery?: string;
  createdAt?: string;
}

export interface BatchAllocation {
  productDocumentId?: string;
  slug: string;
  sku?: string;
  name: string;
  batchDocumentId?: string | null;
  batchNumber: string;
  productionDate?: string;
  expiryDate?: string;
  qty: number;
}

export interface AdminCustomer {
  email: string;
  customerName: string;
  shippingAddressText?: string;
  orderCount: number;
  paidOrderCount: number;
  refundedOrderCount: number;
  lifetimeValueCents: number;
  lastOrderAt?: string;
  lastOrderNumber?: string;
  lastOrderDocumentId?: string;
  lastOrderStatus?: AdminOrderStatus;
}

export interface FulfilmentChecklistItem {
  productId?: string;
  sku?: string;
  name: string;
  qty: number;
  scannedQty?: number;
  checked: boolean;
}

export interface AdminProduct {
  documentId: string;
  slug: string;
  sku?: string;
  name: string;
  botanical?: string;
  category: "energy" | "digestion" | "balance";
  priceCents: number;
  tagline?: string;
  description?: string;
  ingredients?: string[];
  allergens?: string[];
  benefits?: string[];
  howToUse?: string;
  certifications?: string[];
  netWeight?: string;
  featured?: boolean;
  image?: { url?: string; alternativeText?: string; name?: string } | null;
  imageUrl?: string;
  gradient?: string[];
  stock?: number;
  minStock?: number;
  maxStock?: number;
  publishedAt?: string;
  updatedAt?: string;
}

export interface InventoryMovement {
  documentId: string;
  productDocumentId: string;
  productName: string;
  sku?: string;
  slug?: string;
  delta: number;
  balanceAfter: number;
  reason: "sale" | "manual_adjustment" | "restock" | "correction" | "initial_stock" | "refund";
  reference?: string;
  actor?: string;
  createdAt: string;
}

export interface AdminPromotion {
  documentId: string;
  name: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number;
  perCustomerLimit?: number;
  usageCount?: number;
  minimumSpendCents?: number;
  productSlugs?: string[];
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryBatch {
  documentId: string;
  productDocumentId: string;
  productName: string;
  sku?: string;
  slug: string;
  batchNumber: string;
  quantity: number;
  reservedQuantity: number;
  productionDate?: string;
  expiryDate: string;
  daysUntilExpiry?: number | null;
  certificateUrl?: string;
  supplierName?: string;
  purchaseOrderNumber?: string;
  recallReason?: string;
  recalledAt?: string;
  status: "active" | "quarantined" | "depleted" | "recalled";
  createdAt?: string;
}

export interface Supplier {
  documentId: string;
  name: string;
  code: string;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  notes?: string;
  active: boolean;
}

export interface PurchaseOrderItem {
  productDocumentId: string;
  productName: string;
  sku?: string;
  quantity: number;
  batchNumber: string;
  productionDate: string;
  expiryDate: string;
  certificateUrl?: string;
}

export interface PurchaseOrder {
  documentId: string;
  poNumber: string;
  supplierDocumentId: string;
  supplierName: string;
  status: "draft" | "ordered" | "in_transit" | "received" | "cancelled";
  items: PurchaseOrderItem[];
  expectedDate?: string;
  receivedAt?: string;
  notes?: string;
  createdAt?: string;
}

export interface AuditLog {
  documentId: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  actor: string;
  role: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface BatchTraceability {
  batch: InventoryBatch;
  impactedOrders: Pick<AdminOrder, "documentId" | "orderNumber" | "customerName" | "email" | "status" | "trackingNumber" | "createdAt">[];
  impactedCustomers: number;
}

export interface ReturnRequest {
  documentId: string;
  returnNumber: string;
  orderDocumentId: string;
  orderNumber: string;
  email?: string;
  items: AdminOrderItem[];
  reason: string;
  status: "requested" | "approved" | "rejected" | "received" | "refunded";
  restock: boolean;
  adminNote?: string;
  createdAt?: string;
}

export interface NotificationLog {
  documentId: string;
  recipient: string;
  template: string;
  subject: string;
  status: "simulated" | "sent" | "failed";
  orderNumber?: string;
  createdAt: string;
}

export interface StoreContent {
  documentId?: string;
  heroEyebrow?: string;
  heroTitle?: string;
  heroHighlight?: string;
  heroDescription?: string;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  heroEyebrowRo?: string;
  heroTitleRo?: string;
  heroHighlightRo?: string;
  heroDescriptionRo?: string;
  primaryCtaLabelRo?: string;
  secondaryCtaLabelRo?: string;
  pillarsEyebrow?: string;
  pillarsTitle?: string;
  featuredEyebrow?: string;
  featuredTitle?: string;
  storyEyebrow?: string;
  storyTitle?: string;
  storyDescription?: string;
  pillarsEyebrowRo?: string;
  pillarsTitleRo?: string;
  featuredEyebrowRo?: string;
  featuredTitleRo?: string;
  storyEyebrowRo?: string;
  storyTitleRo?: string;
  storyDescriptionRo?: string;
  certifications?: string[];
  updatedAt?: string;
}

export interface AnalyticsSummary {
  visits: number;
  visitsToday: number;
  sales: number;
  revenueCents: number;
  todayRevenueCents: number;
  estimatedProfitCents: number;
  estimatedMargin: number;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${STRAPI_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(ADMIN_API_SECRET
        ? { "x-jamora-admin-secret": ADMIN_API_SECRET }
        : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Admin API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function absoluteStrapiUrl(url?: string) {
  if (!url) return undefined;
  return url.startsWith("http") ? url : `${STRAPI_URL}${url}`;
}

export async function getAdminOrders() {
  const { orders } = await adminFetch<{ orders: AdminOrder[] }>(
    "/api/jamora/admin/orders",
  );
  return orders;
}

export async function getAdminCustomers() {
  const { customers } = await adminFetch<{ customers: AdminCustomer[] }>(
    "/api/jamora/admin/customers",
  );
  return customers;
}

export async function getAdminProducts() {
  try {
    const { products } = await adminFetch<{ products: AdminProduct[] }>(
      "/api/jamora/admin/products",
    );
    return products.map((product) => ({
      ...product,
      imageUrl: absoluteStrapiUrl(product.image?.url),
    }));
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getInventoryMovements() {
  const { movements } = await adminFetch<{ movements: InventoryMovement[] }>(
    "/api/jamora/admin/inventory-movements",
  );
  return movements;
}

export async function getAdminPromotions() {
  const { promotions } = await adminFetch<{ promotions: AdminPromotion[] }>(
    "/api/jamora/admin/promotions",
  );
  return promotions;
}

export async function getInventoryBatches() {
  const { batches } = await adminFetch<{ batches: InventoryBatch[] }>(
    "/api/jamora/admin/inventory-batches",
  );
  return batches;
}

export async function getSuppliers() {
  const { suppliers } = await adminFetch<{ suppliers: Supplier[] }>("/api/jamora/admin/suppliers");
  return suppliers;
}

export async function getPurchaseOrders() {
  const { purchaseOrders } = await adminFetch<{ purchaseOrders: PurchaseOrder[] }>("/api/jamora/admin/purchase-orders");
  return purchaseOrders;
}

export async function getAuditLogs() {
  const { auditLogs } = await adminFetch<{ auditLogs: AuditLog[] }>("/api/jamora/admin/audit-logs");
  return auditLogs;
}

export async function getAdminReturns() {
  const { returns } = await adminFetch<{ returns: ReturnRequest[] }>(
    "/api/jamora/admin/returns",
  );
  return returns;
}

export async function getAdminNotifications() {
  const { notifications } = await adminFetch<{ notifications: NotificationLog[] }>(
    "/api/jamora/admin/notifications",
  );
  return notifications;
}

export async function getAnalyticsSummary() {
  return adminFetch<AnalyticsSummary>("/api/jamora/analytics/summary");
}

export async function getStoreContent() {
  const { content } = await adminFetch<{ content: StoreContent | null }>(
    "/api/jamora/content",
  );
  return content ?? {};
}

export function formatAdminMoney(cents = 0) {
  return formatEUR(cents);
}

export function parseOrderItems(order: Pick<AdminOrder, "items" | "itemsSummary">) {
  if (Array.isArray(order.items)) return order.items;
  const itemsSummary = order.itemsSummary;
  if (!itemsSummary) return [];
  try {
    const parsed = JSON.parse(itemsSummary) as AdminOrderItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function adminProductToProduct(product: AdminProduct): Product {
  return {
    id: product.documentId,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    botanical: product.botanical ?? "",
    category: product.category,
    priceCents: product.priceCents,
    tagline: product.tagline ?? "",
    description: product.description ?? "",
    ingredients: product.ingredients ?? [],
    allergens: product.allergens ?? [],
    benefits: product.benefits ?? [],
    howToUse: product.howToUse ?? "",
  certifications: [],
  netWeight: product.netWeight ?? "",
  featured: product.featured,
  stock: product.stock,
  imageUrl: product.imageUrl,
  gradient: [
      product.gradient?.[0] ?? "#c25a2b",
      product.gradient?.[1] ?? "#9f461f",
    ],
  };
}
