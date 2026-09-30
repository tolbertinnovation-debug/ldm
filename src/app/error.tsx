"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-muted">Please try again. If it keeps happening, contact us and mention code {error.digest ?? "—"}.</p>
        <button onClick={reset} className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg">Try again</button>
      </div>
    </main>
  );
}
