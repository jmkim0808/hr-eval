import { AdminNav } from "@/components/AdminNav";
import { PageHeader } from "@/components/PageHeader";

export default function SetupPage() {
  return (
    <>
      <AdminNav current="/admin/setup" />
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader title="평가 시작 설정" description="누구를, 누가, 언제까지 평가할지 정합니다" />
      </main>
    </>
  );
}
