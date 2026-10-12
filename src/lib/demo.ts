// 시험 모드: 사내 포털 없이 PC에서 시험할 때만 켠다. HR_DEMO=on 이고 메일을 실제로 보내지 않을 때(MAIL_MODE=log)만.
// 운영 서버에는 HR_DEMO를 넣지 않는다 — 넣어도 MAIL_MODE=smtp면 꺼진다.
import { env } from "@/platform/env";

export const isDemo = () => process.env.HR_DEMO === "on" && env.mailMode === "log";
