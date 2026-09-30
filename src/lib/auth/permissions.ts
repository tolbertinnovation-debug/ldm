/**
 * Role-based access control. Pure data + helpers so it can be shared by
 * server code (enforcement) and client code (hiding navigation).
 */

export const PERMISSIONS = [
  "dashboard:view",
  "orders:view",
  "orders:manage",
  "pos:use",
  "products:view",
  "products:manage",
  "inventory:view",
  "inventory:manage",
  "livestock:manage",
  "customers:view",
  "customers:manage",
  "deliveries:view",
  "deliveries:manage",
  "deliveries:drive",
  "payments:view",
  "payments:manage",
  "invoices:manage",
  "expenses:manage",
  "finance:view",
  "reports:view",
  "analytics:view",
  "messages:view",
  "messages:send",
  "broadcasts:manage",
  "marketing:manage",
  "bookings:manage",
  "staff:manage",
  "settings:manage",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const STAFF_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SALES",
  "INVENTORY",
  "ACCOUNTANT",
  "MARKETING",
  "DRIVER",
  "SUPPORT",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type Role = StaffRole | "CUSTOMER";

export const ROLE_META: Record<StaffRole, { label: string; description: string }> = {
  OWNER: { label: "Owner", description: "Full access, including staff and settings." },
  ADMIN: { label: "Administrator", description: "Full access, including staff and settings." },
  MANAGER: { label: "Manager", description: "Runs daily operations: orders, stock, customers, finance, marketing." },
  SALES: { label: "Sales / cashier", description: "Takes orders (POS), records payments, serves customers." },
  INVENTORY: { label: "Farm & inventory", description: "Manages products, stock levels and livestock." },
  ACCOUNTANT: { label: "Accountant", description: "Payments, invoices, expenses and financial reports." },
  MARKETING: { label: "Marketing", description: "Campaigns, promotions, social posts and broadcasts." },
  DRIVER: { label: "Delivery driver", description: "Sees and updates only their assigned deliveries." },
  SUPPORT: { label: "Customer support", description: "Answers messages, manages bookings and customer records." },
};

const ALL = [...PERMISSIONS];

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  MANAGER: ALL.filter((p) => p !== "staff:manage" && p !== "settings:manage" && p !== "audit:view"),
  SALES: [
    "dashboard:view",
    "orders:view",
    "orders:manage",
    "pos:use",
    "products:view",
    "inventory:view",
    "customers:view",
    "customers:manage",
    "deliveries:view",
    "payments:view",
    "payments:manage",
    "invoices:manage",
    "messages:view",
    "messages:send",
    "bookings:manage",
  ],
  INVENTORY: [
    "dashboard:view",
    "orders:view",
    "products:view",
    "products:manage",
    "inventory:view",
    "inventory:manage",
    "livestock:manage",
  ],
  ACCOUNTANT: [
    "dashboard:view",
    "orders:view",
    "customers:view",
    "payments:view",
    "payments:manage",
    "invoices:manage",
    "expenses:manage",
    "finance:view",
    "reports:view",
  ],
  MARKETING: [
    "dashboard:view",
    "products:view",
    "customers:view",
    "analytics:view",
    "reports:view",
    "messages:view",
    "messages:send",
    "broadcasts:manage",
    "marketing:manage",
  ],
  DRIVER: ["deliveries:drive"],
  SUPPORT: [
    "dashboard:view",
    "orders:view",
    "customers:view",
    "customers:manage",
    "deliveries:view",
    "messages:view",
    "messages:send",
    "bookings:manage",
  ],
};

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export function permissionsFor(role: string | null | undefined): readonly Permission[] {
  return isStaffRole(role) ? ROLE_PERMISSIONS[role] : [];
}

export function can(role: string | null | undefined, permission: Permission) {
  return permissionsFor(role).includes(permission);
}

export function canAny(role: string | null | undefined, permissions: readonly Permission[]) {
  const granted = permissionsFor(role);
  return permissions.some((p) => granted.includes(p));
}

/** Only owners may create or modify other owners/admins. */
export function canAssignRole(actorRole: string, targetRole: string) {
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return targetRole !== "OWNER";
  return false;
}
