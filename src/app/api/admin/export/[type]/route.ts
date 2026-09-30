import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, customers, expenses, orders, payments, products } from "@/lib/db/schema";
import { apiUser } from "@/lib/api-guard";
import { audit } from "@/lib/audit";
import { profitAndLoss, rangeFromPreset } from "@/lib/services/analytics";

/** CSV exports for bookkeeping and spreadsheets. */
function csv(rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // defuse spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
const money = (c: number) => (c / 100).toFixed(2);

export async function GET(request: Request, ctx: RouteContext<"/api/admin/export/[type]">) {
  const guard = await apiUser(request, ["reports:view"]);
  if ("error" in guard) return guard.error;
  const { type } = await ctx.params;
  const url = new URL(request.url);
  const fallback = rangeFromPreset("90d");
  const valid = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const from = valid(url.searchParams.get("from")) ?? fallback.from;
  const to = valid(url.searchParams.get("to")) ?? fallback.to;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T23:59:59Z`);
  let rows: (string | number | null)[][] = [];

  switch (type) {
    case "orders": {
      const data = await db.select().from(orders).where(and(gte(orders.createdAt, start), lte(orders.createdAt, end))).orderBy(asc(orders.createdAt));
      rows = [["Order", "Date", "Customer", "Phone", "Channel", "Fulfilment", "Status", "Payment status", "Subtotal", "Discount", "Delivery", "Tax", "Total", "Paid", "Promo", "Campaign"]];
      for (const o of data) rows.push([o.number, o.createdAt.toISOString(), o.contactName, o.contactPhone, o.channel, o.fulfillmentType, o.status, o.paymentStatus, money(o.subtotal), money(o.discountTotal), money(o.deliveryFee), money(o.taxTotal), money(o.total), money(o.amountPaid), o.promoCode, o.utmCampaign]);
      break;
    }
    case "payments": {
      const data = await db.select({ p: payments, order: orders.number, customer: customers.name }).from(payments).leftJoin(orders, eq(orders.id, payments.orderId)).leftJoin(customers, eq(customers.id, payments.customerId)).where(and(gte(payments.createdAt, start), lte(payments.createdAt, end))).orderBy(asc(payments.createdAt));
      rows = [["Reference", "Date", "Kind", "Status", "Method", "Amount", "Order", "Customer", "Provider ref", "Payer phone"]];
      for (const { p, order, customer } of data) rows.push([p.reference, (p.paidAt ?? p.createdAt).toISOString(), p.kind, p.status, p.method, money(p.amount), order, customer, p.providerRef, p.payerPhone]);
      break;
    }
    case "expenses": {
      const data = await db.select().from(expenses).where(and(gte(expenses.date, from), lte(expenses.date, to))).orderBy(asc(expenses.date));
      rows = [["Date", "Category", "Description", "Vendor", "Amount", "Paid by", "Reference"]];
      for (const e of data) rows.push([e.date, e.category, e.description, e.vendor, money(e.amount), e.paymentMethod, e.reference]);
      break;
    }
    case "customers": {
      const data = await db.select().from(customers).orderBy(desc(customers.totalSpent));
      rows = [["Name", "Phone", "Email", "Type", "Business", "Tags", "Orders", "Total spent", "Last order", "Opt-in WhatsApp", "Opt-in SMS", "Opt-in email", "Created"]];
      for (const c of data) rows.push([c.name, c.phone, c.email, c.type, c.companyName, c.tags.join(";"), c.ordersCount, money(c.totalSpent), c.lastOrderAt?.toISOString() ?? null, c.marketingWhatsapp ? "yes" : "no", c.marketingSms ? "yes" : "no", c.marketingEmail ? "yes" : "no", c.createdAt.toISOString()]);
      break;
    }
    case "inventory": {
      const data = await db.select({ p: products, cat: categories.name }).from(products).leftJoin(categories, eq(categories.id, products.categoryId)).where(eq(products.type, "PRODUCT")).orderBy(asc(products.name));
      rows = [["Product", "SKU", "Category", "Unit", "Price", "Cost", "Stock", "Low-stock alert", "Stock value (cost)", "Status"]];
      for (const { p, cat } of data) rows.push([p.name, p.sku, cat, p.unit, money(p.price), p.costPrice !== null ? money(p.costPrice) : null, p.stockQty, p.lowStockThreshold, money(Math.round(Math.max(0, p.stockQty) * (p.costPrice ?? 0))), p.status]);
      break;
    }
    case "pnl": {
      const pl = await profitAndLoss({ from, to });
      rows = [["Line", "Amount"], ["Gross sales", money(pl.grossSales)], ["Discounts", money(-pl.discounts)], ["Refunds", money(-pl.refunds)], ["Net product sales", money(pl.netSales)], ["Delivery income", money(pl.deliveryIncome)], ["Total revenue", money(pl.revenue)], ["Cost of goods sold", money(-pl.cogs)], ["Gross profit", money(pl.grossProfit)]];
      for (const e of pl.expenses) rows.push([`Expense: ${e.name}`, money(-e.amount)]);
      rows.push(["Operating expenses", money(-pl.operatingExpenses)], ["Net profit", money(pl.netProfit)], ["Tax collected (liability)", money(pl.taxCollected)]);
      break;
    }
    default:
      return new Response("Unknown export", { status: 404 });
  }
  await audit({ actor: guard.user, action: "export", entityType: type, summary: `Exported ${type} (${from} to ${to})` });
  return new Response(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reap-${type}-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
