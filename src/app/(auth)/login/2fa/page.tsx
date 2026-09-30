import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getPendingMfa } from "@/lib/auth/session";
import { TwoFactorForm } from "@/components/auth-forms";

export const metadata = { title: "Two-factor authentication" };

export default async function TwoFactorPage() {
  const pending = await getPendingMfa();
  if (!pending) redirect("/login");
  return (
    <>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg"><ShieldCheck className="h-6 w-6" aria-hidden /></span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Two-factor authentication</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Open your authenticator app and enter the current 6-digit code.</p>
      <TwoFactorForm />
    </>
  );
}
