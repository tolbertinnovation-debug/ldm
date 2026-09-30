"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { formatMoney, parseMoney } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/constants";

export async function saveExpenseAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("expenses:manage");
    const d = z
      .object({ id: zf.optionalUuid(), date: zf.date("Date"), category: zf.requiredText("Category", 60), description: zf.requiredText("Description", 300), vendor: zf.optionalText(120), amount: z.string(), paymentMethod: z.enum(PAYMENT_METHODS), reference: zf.optionalText(80) })
      .parse(formObject(formData));
    const amount = parseMoney(d.amount);
    if (!amount || amount <= 0) throw new UserError("Enter the amount.", { amount: "Required" });
    const values = { date: d.date, category: d.category, description: d.description, vendor: d.vendor, amount, paymentMethod: d.paymentMethod, reference: d.reference };
    if (d.id) await db.update(expenses).set(values).where(eq(expenses.id, d.id));
    else await db.insert(expenses).values({ ...values, createdById: actor.id });
    await audit({ actor, action: d.id ? "expense.update" : "expense.create", entityType: "expense", entityId: d.id, summary: `${d.category}: ${d.description} ${formatMoney(amount)}` });
    revalidatePath("/admin/expenses");
    return ok("Expense saved");
  });
}

export async function deleteExpenseAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("expenses:manage");
    const id = z.uuid().parse(formData.get("id"));
    const [e] = await db.delete(expenses).where(eq(expenses.id, id)).returning();
    if (e) await audit({ actor, action: "expense.delete", entityType: "expense", entityId: id, summary: `Deleted ${e.category}: ${e.description} ${formatMoney(e.amount)}`, data: { expense: e as unknown as Record<string, unknown> } });
    revalidatePath("/admin/expenses");
    return ok("Expense deleted");
  });
}
