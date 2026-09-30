import { getSettings } from "@/lib/settings";

export const metadata = { title: "Privacy" };

export default async function PrivacyPage() {
  const { business: b } = await getSettings();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Privacy policy</h1>
      <div className="mt-6 space-y-4 leading-relaxed text-muted">
        <p>{b.name} collects only what we need to take and deliver your orders: your name, phone number, optional email, delivery address and order history.</p>
        <p>We use your phone number to send order confirmations and delivery updates by WhatsApp or SMS. We only send offers if you opt in, and you can unsubscribe at any time by replying STOP or from your account page.</p>
        <p>Payments by mobile money or card are processed by the provider; we never store card numbers. Passwords are stored using strong one-way hashing, and staff access is restricted by role and logged.</p>
        <p>We do not sell your data. To access or delete your information, contact us at {b.email} or {b.phone}.</p>
      </div>
    </div>
  );
}
