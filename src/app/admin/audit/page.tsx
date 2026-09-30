import { and, desc, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { Card, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { pageNum, sp } from "@/components/admin/bits";

export const metadata = { title: "Audit log" };
const PAGE = 50;

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  await requireStaff("audit:view");
  const params = await props.searchParams;
  const q = sp(params.q)?.trim();
  const page = pageNum(params.page);
  const conds: SQL[] = [];
  if (q) conds.push(or(ilike(auditLogs.summary, `%${q}%`), ilike(auditLogs.action, `%${q}%`), ilike(auditLogs.actorName, `%${q}%`))!);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
  ]);
  return (
    <>
      <PageHeader title="Audit log" description="Who did what, and when — sign-ins, price changes, payments, refunds, stock adjustments, exports and access changes." />
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Search person, action or details" className="field h-10 w-full sm:w-80" /></form>
      <Card>
        <Table>
          <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Details</Th><Th>IP</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</Td>
                <Td className="font-medium">{r.actorName ?? "System"}</Td>
                <Td><code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{r.action}</code></Td>
                <Td>{r.summary}</Td>
                <Td className="text-xs text-muted">{r.ip}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} hrefFor={(p) => `/admin/audit?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`} />
      </Card>
    </>
  );
}
