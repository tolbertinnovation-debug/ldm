import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customerAddresses, customers, deliveryZones, pickupLocations } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getCart } from "@/lib/services/cart";
import { getSettings } from "@/lib/settings";
import { momoConfigured, flutterwaveConfigured } from "@/lib/payments/gateways";
import { formatMoney } from "@/lib/money";
import { formatQuantity } from "@/lib/constants";
import { CheckoutForm } from "@/components/shop/checkout-form";
import { ProductImage } from "@/components/shop/visuals";
import { Alert } from "@/components/ui";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const [cart, settings, user] = await Promise.all([getCart(), getSettings(), getCurrentUser()]);
  if (cart.lines.length === 0) redirect("/cart");
  if (!user && !settings.commerce.allowGuestCheckout) redirect("/login?next=/checkout");

  const [zones, pickups] = await Promise.all([
    db.select().from(deliveryZones).where(eq(deliveryZones.active, true)).orderBy(asc(deliveryZones.sortOrder)),
    db.select().from(pickupLocations).where(eq(pickupLocations.active, true)),
  ]);

  const defaults = { name: user?.name ?? "", phone: user?.phone ?? "", email: user?.email ?? "", line1: "", area: "", landmark: "", zoneId: "" };
  if (user) {
    const [customer] = await db.select().from(customers).where(eq(customers.userId, user.id)).limit(1);
    if (customer) {
      defaults.phone = customer.phone ?? defaults.phone;
      const [addr] = await db.select().from(customerAddresses).where(eq(customerAddresses.customerId, customer.id)).orderBy(desc(customerAddresses.isDefault)).limit(1);
      if (addr) Object.assign(defaults, { line1: addr.line1, area: addr.area ?? "", landmark: addr.landmark ?? "", zoneId: addr.zoneId ?? "" });
    }
  }

  const p = settings.payments;
  const payments = [
    ...(p.cashOnDelivery || p.payAtPickup ? [{ method: "CASH", label: "Cash on delivery / at pickup", description: "Pay when you receive your order", icon: "cash" as const }] : []),
    ...(p.orangeMoney.enabled ? [{ method: "ORANGE_MONEY", label: "Orange Money", description: `Send to ${p.orangeMoney.number}`, icon: "orange" as const, needsReference: true, instructions: p.orangeMoney.instructions, number: p.orangeMoney.number, accountName: p.orangeMoney.accountName }] : []),
    ...(p.mtnMomo.enabled
      ? [
          momoConfigured()
            ? { method: "MTN_MOMO", label: "MTN Mobile Money", description: "Approve the payment prompt on your phone", icon: "momo" as const }
            : { method: "MTN_MOMO", label: "MTN Mobile Money", description: `Send to ${p.mtnMomo.number}`, icon: "momo" as const, needsReference: true, instructions: p.mtnMomo.instructions, number: p.mtnMomo.number, accountName: p.mtnMomo.accountName },
        ]
      : []),
    ...(p.card.enabled && flutterwaveConfigured() ? [{ method: "CARD", label: "Debit / credit card", description: "Visa or Mastercard via secure checkout", icon: "card" as const }] : []),
    ...(p.bankTransfer.enabled ? [{ method: "BANK_TRANSFER", label: "Bank transfer", description: p.bankTransfer.details.slice(0, 80), icon: "bank" as const }] : []),
  ];

  const minDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Checkout</h1>
        {!user && (
          <Link href="/login?next=/checkout" className="link text-sm">
            Have an account? Sign in
          </Link>
        )}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <CheckoutForm
          currency={cart.currency}
          pricing={{ subtotal: cart.pricing.subtotal, discountTotal: cart.pricing.discountTotal, taxTotal: cart.pricing.taxTotal, freeDelivery: cart.pricing.freeDelivery }}
          zones={zones.map((z) => ({ id: z.id, name: z.name, description: z.description, fee: z.fee, freeOver: z.freeOver, estimatedTime: z.estimatedTime }))}
          pickups={pickups.map((l) => ({ id: l.id, name: l.name, address: l.address, hours: l.hours }))}
          timeSlots={settings.commerce.timeSlots}
          payments={payments}
          defaults={defaults}
          deliveryEnabled={settings.commerce.deliveryEnabled}
          pickupEnabled={settings.commerce.pickupEnabled && pickups.length > 0}
          allowDelivery={cart.lines.every((l) => l.allowDelivery)}
          allowPickup={cart.lines.every((l) => l.allowPickup)}
          minDate={minDate}
        />
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <h2 className="font-semibold">In your order</h2>
            <ul className="mt-4 space-y-3">
              {cart.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3 text-sm">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    <ProductImage src={l.image} alt="" size="sm" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.name}</span>
                    <span className="text-muted">{formatQuantity(l.quantity, l.unit)}{l.options.length ? ` · ${l.options.map((o) => o.choice).join(", ")}` : ""}</span>
                  </span>
                  <span className="tabular font-semibold">{formatMoney(l.lineTotal, cart.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular">{formatMoney(cart.pricing.subtotal, cart.currency)}</span></div>
              {cart.pricing.discountTotal > 0 && <div className="flex justify-between text-success-fg"><span>Discounts</span><span className="tabular">−{formatMoney(cart.pricing.discountTotal, cart.currency)}</span></div>}
              {cart.pricing.taxTotal > 0 && <div className="flex justify-between"><span className="text-muted">Tax</span><span className="tabular">{formatMoney(cart.pricing.taxTotal, cart.currency)}</span></div>}
            </div>
            {cart.lines.some((l) => l.variableWeight) && <Alert className="mt-4">Weighed items are charged by actual weight — we&apos;ll confirm the final amount.</Alert>}
          </div>
        </aside>
      </div>
    </div>
  );
}
