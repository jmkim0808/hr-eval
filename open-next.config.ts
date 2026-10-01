import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 캐시 저장소(R2·KV)는 쓰지 않는다: 로그인 화면은 모두 매번 새로 그린다 (ADR-0017).
export default defineCloudflareConfig({});
