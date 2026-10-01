# ADR-0002 배포: Cloudflare Workers 유료(월 5달러) + 회사 서버로 옮길 수 있게

- **정해야 했던 것**: 프로그램을 어디서 돌릴지. 기본값은 Vercel이었다.
- **선택지**: ① Vercel 무료 — 약관상 회사 업무용(상업적 사용) 불가 ② Vercel 유료 월 20달러 ③ Netlify 무료 (월 사용량 넘으면 정지, 처리 10초 제한) ④ Cloudflare 무료 — 프로그램 크기 3MB·처리 시간 10ms 한도로 Next.js가 수시로 실패할 가능성 큼 ⑤ Cloudflare 유료 월 5달러 ⑥ 회사 서버
- **고른 것**: ⑤ Cloudflare Workers 유료 (결정권자 승인, 2026-10-01). Next.js는 OpenNext 어댑터(`@opennextjs/cloudflare`)로 올린다. 동시에 같은 코드를 Node.js(`output: "standalone"`)로도 빌드할 수 있게 유지한다.
- **포기한 것**: 0원 운영. Vercel 전용 편의 기능(미리보기 댓글 등). Cloudflare 전용 기능(KV, D1, R2, Durable Objects)은 회사 서버 이전을 막으므로 쓰지 않는다.
- **다시 볼 때**: 내부 공유 후 "외부 서버 vs 회사 서버"를 결정할 때 / Cloudflare 요금·한도 정책이 바뀔 때 / 처리 시간이 30초를 넘는 일이 생길 때.
