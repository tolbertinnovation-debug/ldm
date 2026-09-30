import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { LogoMark } from "@/components/logo";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function unsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) return;
  await db.update(customers).set({ marketingEmail: false, marketingSms: false, marketingWhatsapp: false }).where(eq(customers.unsubscribeToken, token));
}

export default async function UnsubscribePage(props: PageProps<"/unsubscribe/[token]">) {
  const { token } = await props.params;
  const [c] = /^[a-f0-9]{32}$/.test(token) ? await db.select().from(customers).where(eq(customers.unsubscribeToken, token)) : [];
  const done = c && !c.marketingEmail && !c.marketingSms && !c.marketingWhatsapp;
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="card max-w-sm p-8">
        <LogoMark className="mx-auto h-12 w-12" />
        {!c ? (
          <p className="mt-4 text-muted">This link is not valid.</p>
        ) : done ? (
          <>
            <h1 className="mt-4 text-xl font-bold">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-muted">You won&apos;t receive promotions anymore. Order updates will still be sent.</p>
          </>
        ) : (
          <form action={unsubscribe}>
            <h1 className="mt-4 text-xl font-bold">Unsubscribe from offers?</h1>
            <p className="mt-2 text-sm text-muted">We&apos;ll stop sending promotions to {c.name}. You&apos;ll still get order updates.</p>
            <input type="hidden" name="token" value={token} />
            <button className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg">Unsubscribe</button>
          </form>
        )}
      </div>
    </main>
  );
}
