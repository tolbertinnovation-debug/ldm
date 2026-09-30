"use client";

import { Trash2 } from "lucide-react";
import { ActionButton, Field, Form, Input, Select, SubmitButton } from "@/components/form";
import { deleteExpenseAction, saveExpenseAction } from "@/app/admin/expenses/actions";
import { EXPENSE_CATEGORIES, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";

export function ExpenseForm({ today, categories }: { today: string; categories: string[] }) {
  const all = [...new Set([...EXPENSE_CATEGORIES, ...categories])];
  return (
    <Form action={saveExpenseAction} resetOnSuccess refresh className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Date" name="date"><Input name="date" type="date" defaultValue={today} /></Field>
      <Field label="Category" name="category">
        <Input name="category" list="expense-cats" placeholder="e.g. Animal feed" />
        <datalist id="expense-cats">{all.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Amount" name="amount"><Input name="amount" inputMode="decimal" placeholder="0.00" /></Field>
      <Field label="Paid by" name="paymentMethod"><Select name="paymentMethod" defaultValue="CASH" options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} /></Field>
      <Field label="Description" name="description" className="sm:col-span-2"><Input name="description" placeholder="What was it for?" /></Field>
      <Field label="Vendor" name="vendor"><Input name="vendor" /></Field>
      <Field label="Receipt / ref #" name="reference"><Input name="reference" /></Field>
      <div className="sm:col-span-2 lg:col-span-4"><SubmitButton>Add expense</SubmitButton></div>
    </Form>
  );
}

export function DeleteExpense({ id }: { id: string }) {
  return <ActionButton action={deleteExpenseAction} fields={{ id }} variant="ghost" confirm="Delete this expense?"><Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Delete</span></ActionButton>;
}
