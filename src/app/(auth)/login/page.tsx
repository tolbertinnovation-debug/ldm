import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/permissions";
import { LoginForms } from "@/components/auth-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  const user = await getCurrentUser();
  if (user) redirect(isStaffRole(user.role) ? (user.role === "DRIVER" ? "/driver" : "/admin") : "/account");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Sign in to order faster and track your deliveries.</p>
      <LoginForms next={next} />
      <p className="mt-8 text-center text-sm text-muted">
        New here? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Create an account</Link>
      </p>
    </>
  );
}
