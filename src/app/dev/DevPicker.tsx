"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { demoTokenAction } from "./actions";

/** 고른 사람으로 "포털 로그인"한 상태를 만들고 2차 인증 화면으로 보낸다 */
export function PickButton({ employeeNo, name, disabled }: { employeeNo: string; name: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const token = await demoTokenAction(employeeNo, name);
          localStorage.setItem("ax_access_token", token);
          router.push("/login");
        })
      }
    >
      <LogIn aria-hidden="true" />
      이 사람으로 들어가기
    </Button>
  );
}
