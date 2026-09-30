import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { countActiveSessions, requireStaff } from "@/lib/auth/session";
import { decrypt } from "@/lib/crypto";
import { totpUri } from "@/lib/auth/totp";
import { getSettings } from "@/lib/settings";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { ConfirmTwoFactor, DisableTwoFactor, SignOutOthers, StaffPasswordForm, StartTwoFactor } from "@/components/admin/security-forms";

export const metadata = { title: "My security" };

export default async function SecurityPage() {
  const user = await requireStaff();
  const [row] = await db.select({ secret: users.totpSecret, enabled: users.totpEnabled, email: users.email }).from(users).where(eq(users.id, user.id));
  const settings = await getSettings();
  const sessionsCount = await countActiveSessions(user.id);
  let setup: { qr: string; secret: string } | null = null;
  if (row?.secret && !row.enabled) {
    const secret = decrypt(row.secret);
    setup = { secret, qr: await QRCode.toDataURL(totpUri(secret, row.email ?? user.name, settings.business.name), { margin: 1, width: 220 }) };
  }
  return (
    <>
      <PageHeader title="My security" description="Protect your account — staff accounts can see customer data and money." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2">{row?.enabled ? <ShieldCheck className="h-5 w-5 text-success-fg" aria-hidden /> : <ShieldAlert className="h-5 w-5 text-warning-fg" aria-hidden />} Two-factor authentication</span>} description="After your password, you'll also enter a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy)." />
          <CardBody className="space-y-4">
            {row?.enabled ? (
              <><p className="text-sm font-medium text-success-fg">Two-factor is on. 👍</p><DisableTwoFactor /></>
            ) : setup ? (
              <div className="space-y-4">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-muted"><li>Install an authenticator app on your phone.</li><li>Scan this QR code (or type the key).</li><li>Enter the 6-digit code it shows.</li></ol>
                <div className="flex flex-wrap items-center gap-4">
                  <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-xl border border-border bg-white p-2" />
                  <code className="break-all rounded-lg bg-surface-2 px-3 py-2 text-sm">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
                </div>
                <ConfirmTwoFactor />
              </div>
            ) : (
              <StartTwoFactor />
            )}
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card><CardHeader title="Password" /><CardBody><StaffPasswordForm /></CardBody></Card>
          <Card><CardHeader title="Devices" description={`You're signed in on ${sessionsCount} device${sessionsCount === 1 ? "" : "s"}.`} /><CardBody><SignOutOthers /></CardBody></Card>
        </div>
      </div>
    </>
  );
}
