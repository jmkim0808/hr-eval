# 인사평가 시스템 — UI 디자인 규칙

UI 디자인 워크숍(2026-10-01) 결과물. 기준 문서는 `docs/domain`, `docs/ux`.

| 파일 | 내용 |
|---|---|
| [01-디자인-규칙.md](01-디자인-규칙.md) | 10가지 규칙을 값과 이유와 함께 정리 |
| [tokens.css](tokens.css) | 모든 값의 원본 — CSS 변수(이름표) |
| [tailwind.preset.js](tailwind.preset.js) | Tailwind를 쓸 때 같은 이름표를 부르는 설정 |
| [components.css](components.css) | 부품 모양 (tokens.css 이름표만 사용) |
| [components.html](components.html) | 부품 카탈로그 — 모든 부품을 상태별로 |
| [screens.html](screens.html) | 전체 화면 보고서 — 11개 화면 × 잘 됐을 때·비어 있을 때·기다릴 때·잘못됐을 때 |
| [report.css](report.css) | 위 두 보고서 전용 틀 (서비스 화면에는 쓰지 않음) |
| [06-선택-기록.md](06-선택-기록.md) | 라운드별 선택지와 고른 이유 |
| [/.cursor/rules/design-system.mdc](../../.cursor/rules/design-system.mdc) | 코드 작성 시 자동으로 지킬 규칙 |

보고서 HTML은 브라우저로 바로 열면 된다. 글꼴(Noto Sans KR)은 Google Fonts에서 불러온다.
