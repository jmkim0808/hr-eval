/** 포털 주소 아래 경로 (ax-app.yaml의 base_path). 화면·API·쿠키가 모두 이 아래에서 동작한다 */
export const BASE_PATH = (process.env.BASE_PATH ?? "/hr-eval").replace(/\/$/, "");
