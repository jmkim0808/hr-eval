// 평가지 양식 (원본: 팀원용·팀장용 인사평가지 엑셀). 항목이 바뀌면 FORM_VERSION을 올린다.
export const FORM_VERSION = 1;

export type FormType = "member" | "leader";
export type Item = { code: string; group: string; name: string; desc: string };

const C = {
  responsibility: { code: "responsibility", group: "공통역량(인성)", name: "책임감", desc: "업무의 과정 및 결과에 대한 책임을 지며, 자신의 고유 업무에 대해 직업 의식이 투철함" },
  teamwork: { code: "teamwork", group: "공통역량(인성)", name: "팀워크", desc: "동료와 협업을 잘 하며, 팀 구성원에 대한 관심이 높음" },
  discipline: { code: "discipline", group: "공통역량(인성)", name: "규율성", desc: "제규정을 준수하며, 회사의 목표를 잘 이해하고 이행함" },
  objectivity: { code: "objectivity", group: "공통역량(인성)", name: "객관성", desc: "업무에 있어 공정하게 판단하고, 자신의 권한을 남용하지 않음" },
  execution: { code: "execution", group: "직무역량", name: "일처리", desc: "일관성을 유지하며 신속 정확하게 업무를 마감함" },
  knowledge: { code: "knowledge", group: "직무역량", name: "지식", desc: "업무에 대한 경험 및 전문지식이 있으며, 추가 개발의 의지가 있음" },
  information: { code: "information", group: "직무역량", name: "정보력", desc: "업무 관련 외적, 내적 변화에 신속하게 대응함" },
  contribution: { code: "contribution", group: "직무역량", name: "기여도", desc: "팀/상사의 목표에 기여하고 부응하는 정도가 큼" },
} satisfies Record<string, Item>;

export const FORMS: Record<FormType, Item[]> = {
  member: [
    C.responsibility, C.teamwork, C.discipline, C.objectivity,
    C.execution, C.knowledge, C.information, C.contribution,
    { code: "communication", group: "대인관계", name: "소통", desc: "명확하고 간결한 단어 사용 능력이 있고, 상대방의 이야기를 끝까지 경청하며, 의도를 잘 파악함" },
    { code: "trust", group: "대인관계", name: "신뢰성", desc: "상대방을 존중하고 배려하며, 원활한 조직문화에 기여함" },
  ],
  leader: [
    C.responsibility, C.teamwork, C.discipline, C.objectivity,
    C.knowledge, C.information, C.contribution,
    { code: "leadership", group: "팀장역량", name: "리더쉽", desc: "목표달성을 위하여 팀원들에게 지속적으로 동기를 부여하고, 리더로서 주도적 역할을 함" },
    { code: "communication", group: "팀장역량", name: "소통", desc: "명확하고 간결한 단어 사용 능력이 있고, 팀원의 이야기를 끝까지 경청하며, 의도를 잘 파악함" },
    { code: "planning", group: "팀장역량", name: "계획", desc: "업무 목적에 맞게 계획을 수립하고, 변화에 능동적으로 대응함" },
  ],
};

/** 원본 양식의 점수 기준 (1·5·10만 숫자가 붙어 있다) */
export const SCALE_LEGEND = "1 미흡 · 약간 미흡 · 5 보통 · 우수 · 10 탁월";

export const TEXT_MAX = 4000;

/** 저장할 수 있는 값인지 (없는 항목·범위 밖 점수는 버린다) */
export function cleanScores(form: FormType, scores: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of FORMS[form]) {
    const v = scores[it.code];
    if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 10) out[it.code] = v;
  }
  return out;
}

export type SelfDraft = { scores: Record<string, number>; achievement: string; improvement: string };
export type SubmitIssues = { missingItems: string[]; achievement?: string; improvement?: string };

/** 제출 전 검사: 본인평가 10개, 업적 두 칸 */
export function checkSelfSubmit(form: FormType, d: SelfDraft, year: number): SubmitIssues | null {
  const missingItems = FORMS[form].filter((it) => !d.scores[it.code]).map((it) => it.code);
  const issues: SubmitIssues = { missingItems };
  if (!d.achievement.trim()) issues.achievement = `"${year}년 개인역할 및 업적"을 적어 주세요. 지난 1년간 맡은 일과 이룬 결과를 적으면 됩니다.`;
  if (!d.improvement.trim()) issues.improvement = `"${year + 1}년 개선 및 발전"을 적어 주세요. 내년에 무엇을 어떻게 발전시킬지 적으면 됩니다.`;
  return missingItems.length || issues.achievement || issues.improvement ? issues : null;
}
