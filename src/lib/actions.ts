import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AuthError } from "@/lib/auth/session";

/** Shape returned by every form server action and consumed by <Form>. */
export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, unknown>;
  /** Changes on every submission so the client can react to repeated results. */
  nonce?: number;
};

export const initialActionState: ActionState = { ok: false };

export { UserError } from "./errors";
import { UserError } from "./errors";

export function ok(message?: string, data?: Record<string, unknown>): ActionState {
  return { ok: true, message, data, nonce: Date.now() };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionState {
  return { ok: false, error, fieldErrors, nonce: Date.now() };
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Wraps an action body: converts validation/auth/user errors into ActionState,
 * lets Next.js redirects propagate, and hides unexpected internals.
 */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? ok();
  } catch (err) {
    unstable_rethrow(err); // let redirect()/notFound() propagate
    if (err instanceof z.ZodError) return fail("Please fix the highlighted fields.", zodFieldErrors(err));
    if (err instanceof UserError) return fail(err.message, err.fieldErrors);
    if (err instanceof AuthError) return fail(err.message);
    console.error("Action failed", err);
    return fail("Something went wrong. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// FormData helpers
// ---------------------------------------------------------------------------

export function formObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function formAll(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");
}

/** Zod helpers for common form field shapes. */
export const zf = {
  text: (max = 500) => z.string().trim().max(max),
  requiredText: (label: string, max = 500) => z.string().trim().min(1, `${label} is required`).max(max),
  optionalText: (max = 2000) =>
    z
      .string()
      .trim()
      .max(max)
      .optional()
      .transform((v) => (v ? v : null)),
  checkbox: () =>
    z
      .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("false"), z.literal("")])
      .optional()
      .transform((v) => v === "on" || v === "true" || v === "1"),
  int: (label: string, min = 0, max = 1_000_000) =>
    z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min).max(max),
  optionalInt: (min = 0, max = 1_000_000) =>
    z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), "Enter a whole number"),
  decimal: (label: string, min = 0, max = 1_000_000) =>
    z.coerce.number({ error: `${label} must be a number` }).min(min, `${label} must be at least ${min}`).max(max),
  optionalDecimal: (min = 0, max = 1_000_000) =>
    z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), "Enter a valid number"),
  date: (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date`),
  optionalDate: () =>
    z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date"),
  email: () =>
    z
      .string()
      .trim()
      .toLowerCase()
      .max(200)
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address"),
  uuid: () => z.uuid("Invalid id"),
  optionalUuid: () =>
    z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || z.uuid().safeParse(v).success, "Invalid selection"),
};
