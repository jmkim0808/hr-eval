"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { logoutAction } from "@/app/login/actions";
import { portalSub } from "@/lib/portal";

/**
 * 포털 로그인한 사람(토큰의 사번)과 이 화면의 로그인한 사람이 다르면 바로 로그아웃 (같은 PC에서 사람이 바뀐 경우).
 * 화면을 옮길 때, 창으로 돌아올 때, 포털 로그인 정보가 바뀔 때마다 다시 확인한다.
 */
export function SessionGuard({ employeeNo }: { employeeNo: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    let done = false;
    const verify = () => {
      if (done || (employeeNo && portalSub() === employeeNo)) return;
      done = true;
      void logoutAction().then(() => router.replace("/login"));
    };
    verify();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "ax_access_token") verify();
    };
    window.addEventListener("focus", verify);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", verify);
      window.removeEventListener("storage", onStorage);
    };
  }, [employeeNo, router, pathname]);
  return null;
}
