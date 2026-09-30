import { redirect } from "next/navigation";
import { VerifyCodeForm } from "@/components/auth-forms";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { smsProvider, whatsappProvider } from "@/lib/messaging/providers";
import { Alert } from "@/components/ui";

export const metadata = { title: "Enter code" };

export default async function VerifyPage(props: PageProps<"/login/verify">) {
  const sp = await props.searchParams;
  const phone = normalizePhone(typeof sp.phone === "string" ? sp.phone : "");
  if (!phone) redirect("/login");
  const next = typeof sp.next === "string" ? sp.next : "/account";
  const simulated = process.env.NODE_ENV !== "production" && smsProvider() === "log" && whatsappProvider() === "log";
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Check your phone</h1>
      <p className="mb-6 mt-1 text-sm text-muted">We sent a 6-digit code to <strong className="text-fg">{formatPhone(phone)}</strong>. It expires in 10 minutes.</p>
      {simulated && <Alert tone="warning" className="mb-4">Development mode: no SMS provider is configured, so the code is printed in the server log.</Alert>}
      <VerifyCodeForm phone={phone} next={next} />
    </>
  );
}
