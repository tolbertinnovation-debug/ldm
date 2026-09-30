import { Lock } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui";

export default function NoAccessPage() {
  return (
    <Card>
      <EmptyState icon={<Lock className="h-6 w-6" />} title="You don't have access to this page" description="Ask an owner or administrator to change your role if you need it." action={<ButtonLink href="/admin" variant="outline">Back to dashboard</ButtonLink>} />
    </Card>
  );
}
