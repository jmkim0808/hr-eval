import { AdminNav } from "@/components/AdminNav";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/server/authz/actor";
import { listAdmins } from "@/server/repo/admins";
import { AddAdminForm, RemoveAdminButton } from "./AdminForms";

export default async function SettingsPage() {
  const a = await requireAdmin();
  const admins = await listAdmins(a);
  return (
    <>
      <AdminNav current="/admin/settings" />
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader title="관리자 설정" description="관리자는 모든 평가를 보고 고칠 수 있습니다 · 추가·해제는 작업 기록에 남습니다" />
        <Card>
          <CardHeader>
            <CardTitle>관리자 추가</CardTitle>
            <CardDescription>추가된 사람은 그 이메일로 인증하면 진행 현황이 열립니다</CardDescription>
          </CardHeader>
          <CardContent>
            <AddAdminForm />
          </CardContent>
        </Card>
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>관리자 {admins.length}명</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((u) => (
                <TableRow key={u.email} data-admin={u.email}>
                  <TableCell className="font-medium">
                    {u.name} {u.email === a.email && <Badge variant="primary">나</Badge>}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell className="py-1.5 text-right">
                    <RemoveAdminButton email={u.email} last={admins.length <= 1} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </main>
    </>
  );
}
