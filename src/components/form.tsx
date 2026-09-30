"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, useTransition, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { buttonClass, cn } from "./ui";
import { toast } from "./toaster";

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, unknown>;
  nonce?: number;
};

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

const FormCtx = createContext<{ state: ActionState; pending: boolean }>({ state: { ok: false }, pending: false });

export function useFormCtx() {
  return useContext(FormCtx);
}

/**
 * Form bound to a server action returning ActionState. Keeps user input on
 * validation errors (no automatic reset), shows field errors inline and
 * success/error toasts. Works without JavaScript via the native action.
 */
export function Form({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  toastOnSuccess = true,
  refresh,
  id,
  confirm,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
  toastOnSuccess?: boolean;
  refresh?: boolean;
  id?: string;
  confirm?: string;
}) {
  // Toasts fire from the action wrapper (not an effect) so feedback still shows
  // when the form unmounts because the page changed, e.g. a delivered order card.
  const wrapped = async (prev: ActionState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res?.ok) {
      if (toastOnSuccess && res.message) toast.success(res.message);
    } else if (res?.error && !res.fieldErrors) {
      toast.error(res.error);
    }
    return res;
  };
  const [state, formAction, pending] = useActionState(wrapped, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const lastNonce = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state.nonce || state.nonce === lastNonce.current) return;
    lastNonce.current = state.nonce;
    if (state.ok) {
      if (resetOnSuccess) ref.current?.reset();
      if (refresh) router.refresh();
      onSuccess?.(state);
    }
  }, [state, resetOnSuccess, onSuccess, refresh, router]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  }

  return (
    <FormCtx.Provider value={{ state, pending }}>
      <form ref={ref} id={id} action={formAction} onSubmit={handleSubmit} className={className} noValidate>
        {!state.ok && state.error && state.fieldErrors && (
          <div role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger-fg">
            {state.error}
          </div>
        )}
        {children}
      </form>
    </FormCtx.Provider>
  );
}

export function Field({
  label,
  name,
  hint,
  children,
  className,
  required,
  optional,
}: {
  label?: ReactNode;
  name?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
  optional?: boolean;
}) {
  const { state } = useFormCtx();
  const error = name ? state.fieldErrors?.[name] : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={name ? `f-${name}` : undefined} className="flex items-baseline justify-between gap-2 text-sm font-medium text-fg">
          <span>
            {label}
            {required && <span className="text-danger"> *</span>}
          </span>
          {optional && <span className="text-xs font-normal text-subtle">Optional</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ name, className, ...props }: ComponentProps<"input"> & { name: string }) {
  const { state } = useFormCtx();
  const invalid = !!state.fieldErrors?.[name];
  return <input id={`f-${name}`} name={name} aria-invalid={invalid || undefined} className={cn("field", className)} {...props} />;
}

export function Textarea({ name, className, rows = 3, ...props }: ComponentProps<"textarea"> & { name: string }) {
  const { state } = useFormCtx();
  const invalid = !!state.fieldErrors?.[name];
  return <textarea id={`f-${name}`} name={name} rows={rows} aria-invalid={invalid || undefined} className={cn("field resize-y", className)} {...props} />;
}

export function Select({
  name,
  className,
  options,
  placeholder,
  ...props
}: ComponentProps<"select"> & { name: string; options: { value: string; label: string }[]; placeholder?: string }) {
  const { state } = useFormCtx();
  const invalid = !!state.fieldErrors?.[name];
  return (
    <select id={`f-${name}`} name={name} aria-invalid={invalid || undefined} className={cn("field appearance-auto pr-8", className)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ name, label, description, className, ...props }: ComponentProps<"input"> & { name: string; label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3 text-sm", className)}>
      <input id={id} type="checkbox" name={name} className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-[var(--primary)]" {...props} />
      <span>
        <span className="font-medium text-fg">{label}</span>
        {description && <span className="block text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "accent" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const ctx = useFormCtx();
  const busy = pending || ctx.pending;
  return (
    <button type="submit" name={name} value={value} disabled={busy || disabled} aria-busy={busy} className={buttonClass(variant, size, className)}>
      {busy && <Spinner />}
      {busy && pendingText ? pendingText : children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * One-click action button (e.g. "Confirm order", "Mark paid"). Calls the server
 * action directly so feedback still shows when the button itself disappears
 * after the page updates.
 */
export function ActionButton({
  action,
  children,
  fields,
  variant = "outline",
  size = "sm",
  confirm,
  className,
  pendingText,
}: {
  action: Action;
  children: ReactNode;
  fields?: Record<string, string>;
  variant?: "primary" | "secondary" | "danger" | "accent" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  confirm?: string;
  className?: string;
  pendingText?: string;
}) {
  const [pending, startActionTransition] = useTransition();
  const router = useRouter();
  function run() {
    if (confirm && !window.confirm(confirm)) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields ?? {})) fd.append(k, v);
    startActionTransition(async () => {
      try {
        const res = await action({ ok: false }, fd);
        if (res?.ok) {
          if (res.message) toast.success(res.message);
          router.refresh();
        } else if (res?.error) toast.error(res.error);
      } catch (err) {
        // redirect() inside the action surfaces here as a navigation; anything else is a real error
        if (err && typeof err === "object" && "digest" in err && String((err as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw err;
        toast.error("Something went wrong. Please try again.");
      }
    });
  }
  return (
    <button type="button" onClick={run} disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending && <Spinner />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
