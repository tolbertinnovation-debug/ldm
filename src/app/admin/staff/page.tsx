import { asc, ne } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { permissionsFor, PERMISSIONS, ROLE_META, STAFF_ROLES, type StaffRole } from "@/lib/auth/permissions";
import { timeAgo } from "@/lib/format";
import { Avatar, Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { NewStaffForm, StaffRowForm } from "@/components/admin/staff-forms";

export const metadata = { title: "Staff & access" };

export default async function StaffPage() {
  const me = await requireStaff("staff:manage");
  const staff = await db.select().from(users).where(ne(users.role, "CUSTOMER")).orderBy(asc(users.role), asc(users.name));
  return (
    <>
      <PageHeader title="Staff & access" description="Give each team member only the access their job needs. Every sensitive action is recorded in the audit log." />
      <Card>
        <Table>
          <thead><tr><Th>Person</Th><Th>Role</Th><Th>Security</Th><Th>Last sign-in</Th><Th>Manage</Th></tr></thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <Td><div className="flex items-center gap-3"><Avatar name={u.name} /><span><span className="font-semibold">{u.name}{u.id === me.id && " (you)"}</span><span className="block text-xs text-muted">{u.email} {u.phone && `· ${u.phone}`}</span></span></div></Td>
                <Td><Badge tone="brand">{ROLE_META[u.role as StaffRole]?.label ?? u.role}</Badge>{!u.active && <Badge tone="danger" className="ml-1">Inactive</Badge>}</Td>
                <Td>{u.totpEnabled ? <span className="inline-flex items-center gap-1 text-sm text-success-fg"><ShieldCheck className="h-4 w-4" aria-hidden /> 2FA on</span> : <span className="text-sm text-warning-fg">2FA off</span>}{u.lockedUntil && u.lockedUntil > new Date() && <Badge tone="danger" className="ml-1">Locked</Badge>}</Td>
                <Td className="text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</Td>
                <Td><StaffRowForm u={{ id: u.id, role: u.role, active: u.active, totpEnabled: u.totpEnabled }} self={u.id === me.id} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Add a staff member" description="Share the temporary password privately; they should change it and turn on 2FA in My security." />
        <CardBody><NewStaffForm /></CardBody>
      </Card>
      <Card className="mt-6">
        <CardHeader title="What each role can do" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead><tr><th className="sticky left-0 bg-surface px-4 py-2 text-left">Permission</th>{STAFF_ROLES.map((r) => <th key={r} className="px-2 py-2 font-semibold">{ROLE_META[r].label}</th>)}</tr></thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p} className="border-t border-border">
                  <td className="sticky left-0 bg-surface px-4 py-1.5 font-mono text-muted">{p}</td>
                  {STAFF_ROLES.map((r) => <td key={r} className="text-center">{permissionsFor(r).includes(p) ? <span className="text-success-fg">●</span> : <span className="text-border-strong">·</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
