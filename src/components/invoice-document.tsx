import { LogoMark } from "@/components/logo";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import type { StoreSettings } from "@/lib/settings";

type Line = { description: string; quantity: number; unit: string | null; unitPrice: number; lineTotal: number };

export function InvoiceDocument({
  settings,
  title,
  number,
  issueDate,
  dueDate,
  status,
  customer,
  lines,
  subtotal,
  discount,
  tax,
  total,
  paid,
  notes,
  terms,
}: {
  settings: StoreSettings;
  title: string;
  number: string;
  issueDate: string | Date;
  dueDate?: string | null;
  status?: string;
  customer: { name: string; phone?: string | null; email?: string | null; address?: string | null; company?: string | null };
  lines: Line[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  notes?: string | null;
  terms?: string | null;
}) {
  const b = settings.business;
  const cur = settings.commerce.currency;
  const p = settings.payments;
  const balance = Math.max(0, total - paid);
  return (
    <article className="print-plain mx-auto max-w-3xl rounded-2xl border border-border bg-white p-6 text-[#1c1917] shadow-card sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-3">
          <LogoMark className="h-12 w-12" />
          <div className="text-sm">
            <p className="text-lg font-bold">{b.name}</p>
            <p className="text-[#6b645c]">{b.legalName}</p>
            <p className="text-[#6b645c]">{b.address}, {b.city}, {b.country}</p>
            <p className="text-[#6b645c]">{b.phone} · {b.email}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold uppercase tracking-wide text-[#1d5531]">{title}</p>
          <p className="font-semibold">{number}</p>
          {status && <p className="mt-1 inline-block rounded-full bg-[#f4f1ea] px-2.5 py-0.5 text-xs font-semibold uppercase">{status}</p>}
        </div>
      </header>

      <section className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#938b80]">Bill to</p>
          <p className="mt-1 font-semibold">{customer.company ?? customer.name}</p>
          {customer.company && <p>{customer.name}</p>}
          {customer.phone && <p>{formatPhone(customer.phone)}</p>}
          {customer.email && <p>{customer.email}</p>}
          {customer.address && <p>{customer.address}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-1 sm:text-right">
          <dt className="text-[#6b645c]">Issued</dt>
          <dd className="font-medium">{formatDate(issueDate)}</dd>
          {dueDate && (
            <>
              <dt className="text-[#6b645c]">Due</dt>
              <dd className="font-medium">{formatDate(dueDate)}</dd>
            </>
          )}
          <dt className="text-[#6b645c]">Balance due</dt>
          <dd className="font-bold">{formatMoney(balance, cur)}</dd>
        </dl>
      </section>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-[#1c1917] text-left text-xs uppercase tracking-wide">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Price</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-[#e7e2d8]">
              <td className="py-2.5 pr-3">{l.description}</td>
              <td className="py-2.5 text-right tabular-nums">{l.quantity % 1 === 0 ? l.quantity : l.quantity.toFixed(2)} {l.unit ?? ""}</td>
              <td className="py-2.5 text-right tabular-nums">{formatMoney(l.unitPrice, cur)}</td>
              <td className="py-2.5 text-right font-medium tabular-nums">{formatMoney(l.lineTotal, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatMoney(subtotal, cur)}</dd></div>
        {discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd className="tabular-nums">−{formatMoney(discount, cur)}</dd></div>}
        {tax > 0 && <div className="flex justify-between"><dt>{settings.commerce.taxLabel}</dt><dd className="tabular-nums">{formatMoney(tax, cur)}</dd></div>}
        <div className="flex justify-between border-t-2 border-[#1c1917] pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(total, cur)}</dd></div>
        <div className="flex justify-between"><dt>Paid</dt><dd className="tabular-nums">{formatMoney(paid, cur)}</dd></div>
        <div className="flex justify-between font-bold text-[#1d5531]"><dt>Balance</dt><dd className="tabular-nums">{formatMoney(balance, cur)}</dd></div>
      </dl>

      <footer className="mt-10 grid gap-6 border-t border-[#e7e2d8] pt-6 text-xs text-[#6b645c] sm:grid-cols-2">
        <div>
          <p className="font-semibold uppercase tracking-wide text-[#1c1917]">How to pay</p>
          {p.orangeMoney.enabled && <p className="mt-1">Orange Money: {p.orangeMoney.number} ({p.orangeMoney.accountName})</p>}
          {p.mtnMomo.enabled && <p>MTN MoMo: {p.mtnMomo.number} ({p.mtnMomo.accountName})</p>}
          {p.bankTransfer.enabled && <p className="whitespace-pre-line">{p.bankTransfer.details}</p>}
          <p>Cash at {b.address}. Quote {number} as reference.</p>
        </div>
        <div>
          {terms && <p className="whitespace-pre-line">{terms}</p>}
          {notes && <p className="mt-2 whitespace-pre-line font-medium text-[#1c1917]">{notes}</p>}
        </div>
      </footer>
    </article>
  );
}
