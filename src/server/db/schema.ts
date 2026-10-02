// DB 구조 (docs/tech/02-데이터-구조.md). 바꿀 때는 drizzle-kit generate로 마이그레이션 SQL을 만든다.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** 관리자 · 대표이사 계정 */
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "ceo"] }).notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** 정기평가 (연 1회) */
export const reviewCycles = pgTable("review_cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  year: integer("year").notNull().unique(),
  status: text("status", {
    enum: ["setup", "self_review", "first_review", "second_review", "final_review", "confirmed", "results_sent", "closed"],
  })
    .notNull()
    .default("setup"),
  selfStart: date("self_start"),
  selfEnd: date("self_end"),
  firstStart: date("first_start"),
  firstEnd: date("first_end"),
  secondStart: date("second_start"),
  secondEnd: date("second_end"),
  bonusCutoff: date("bonus_cutoff"),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedBy: text("confirmed_by"),
  /** 처음 확정한 시각. 확정을 취소해도 가점은 다시 열리지 않는다 */
  bonusClosedAt: timestamp("bonus_closed_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedBy: text("closed_by"),
  version: integer("version").notNull().default(0),
  ...timestamps,
});

/** 직원 명단 한 줄 = 평가 대상 + 평가자(임원 포함). 해마다 새로 올린다 */
export const cyclePeople = pgTable(
  "cycle_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => reviewCycles.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    department: text("department").notNull().default(""),
    position: text("position").notNull().default(""),
    hireDate: date("hire_date").notNull(),
    isTeamLeader: boolean("is_team_leader").notNull().default(false),
    isExecutive: boolean("is_executive").notNull().default(false),
    isTarget: boolean("is_target").notNull().default(true),
    excludedReason: text("excluded_reason"),
    gradeGroup: smallint("grade_group"),
    formType: text("form_type", { enum: ["member", "leader"] }),
    firstReviewerId: uuid("first_reviewer_id").references((): AnyPgColumn => cyclePeople.id, { onDelete: "set null" }),
    secondReviewerId: uuid("second_reviewer_id").references((): AnyPgColumn => cyclePeople.id, { onDelete: "set null" }),
    accessBlocked: boolean("access_blocked").notNull().default(false),
    rowNo: integer("row_no").notNull().default(0),
    ...timestamps,
  },
  (t) => [unique("cycle_people_cycle_email").on(t.cycleId, t.email)],
);

/** 보낼 메일 목록 — 점수·등급·업적 글을 담지 않는다 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id").references(() => reviewCycles.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["invite", "reminder", "stage_notice", "result_notice", "admin_alert"] }).notNull(),
    toEmail: text("to_email").notNull(),
    personId: uuid("person_id"),
    payload: jsonb("payload").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status", { enum: ["queued", "sending", "sent", "failed"] }).notNull().default("queued"),
    attempts: smallint("attempts").notNull().default(0),
    lastError: text("last_error"),
    batchId: uuid("batch_id").notNull(),
    createdBy: text("created_by"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_outbox_status_idx").on(t.status, t.createdAt), index("email_outbox_batch_idx").on(t.batchId)],
);

/** 이메일 인증번호 (원문은 저장하지 않는다) */
export const authCodes = pgTable(
  "auth_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    codeHash: text("code_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: smallint("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    requestIp: text("request_ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_codes_email_idx").on(t.email, t.createdAt), index("auth_codes_ip_idx").on(t.requestIp, t.createdAt)],
);

/** 로그인 상태 (세션 열쇠는 해시로만 저장) */
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 작업 기록 */
export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  cycleId: uuid("cycle_id"),
  personId: uuid("person_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 오류 기록 — 개인정보·점수·업적 글을 넣지 않는다 */
export const errorLogs = pgTable("error_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  where: text("where_").notNull(),
  message: text("message").notNull(),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 평가지 한 장 = 피평가자 한 명 */
export const evaluations = pgTable("evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id")
    .notNull()
    .unique()
    .references(() => cyclePeople.id, { onDelete: "cascade" }),
  formVersion: smallint("form_version").notNull().default(1),
  achievementText: text("achievement_text").notNull().default(""),
  improvementText: text("improvement_text").notNull().default(""),
  selfSubmittedAt: timestamp("self_submitted_at", { withTimezone: true }),
  firstSubmittedAt: timestamp("first_submitted_at", { withTimezone: true }),
  secondSubmittedAt: timestamp("second_submitted_at", { withTimezone: true }),
  version: integer("version").notNull().default(0),
  ...timestamps,
});

/** 점수 한 칸: 누가(본인·1차·2차) 어떤 항목에 */
export const evaluationScores = pgTable(
  "evaluation_scores",
  {
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    rater: text("rater", { enum: ["self", "first", "second"] }).notNull(),
    itemCode: text("item_code").notNull(),
    score: smallint("score").notNull(),
    enteredBy: text("entered_by"),
  },
  (t) => [primaryKey({ columns: [t.evaluationId, t.rater, t.itemCode] })],
);

/** 가점: 사람 × 항목. 템플릿·직접 입력으로 반영한 사람은 7개 항목이 모두 들어간다 (빈칸 = 0) */
export const bonusPoints = pgTable(
  "bonus_points",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => cyclePeople.id, { onDelete: "cascade" }),
    item: text("item", { enum: ["certificate", "award", "invention", "education", "discipline", "internal_control", "multi_rater"] }).notNull(),
    points: numeric("points", { precision: 6, scale: 2 }).notNull(),
    note: text("note"),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.personId, t.item] })],
);

/** 최종평가 결과 (ADR-0014). 2차평가를 넘길 때, 그 뒤 가점·대신 입력이 바뀔 때 다시 계산해 저장한다 */
export const finalResults = pgTable("final_results", {
  personId: uuid("person_id")
    .primaryKey()
    .references(() => cyclePeople.id, { onDelete: "cascade" }),
  cycleId: uuid("cycle_id")
    .notNull()
    .references(() => reviewCycles.id, { onDelete: "cascade" }),
  blank: boolean("blank").notNull().default(false),
  competencyScore: numeric("competency_score", { precision: 6, scale: 2 }),
  achievementScore: numeric("achievement_score", { precision: 6, scale: 2 }),
  firstTotal: numeric("first_total", { precision: 6, scale: 2 }),
  secondTotal: numeric("second_total", { precision: 6, scale: 2 }),
  bonusTotal: numeric("bonus_total", { precision: 6, scale: 2 }),
  finalScore: numeric("final_score", { precision: 6, scale: 2 }),
  groupRank: integer("group_rank"),
  draftGrade: text("draft_grade", { enum: ["S", "A", "B", "C", "D"] }),
  finalGrade: text("final_grade", { enum: ["S", "A", "B", "C", "D"] }),
  tieRule: boolean("tie_rule").notNull().default(false),
  changeKind: text("change_kind", { enum: ["none", "adjusted", "pushed"] }).notNull().default("none"),
  displayPercentile: numeric("display_percentile", { precision: 5, scale: 1 }),
  /** 다시 계산(대신 입력·가점)으로 초안 등급이 바뀌었으면 바뀌기 전 등급 */
  recalcFrom: text("recalc_from", { enum: ["S", "A", "B", "C", "D"] }),
  ...timestamps,
});

/** 등급조정 이력. 되돌리기를 위해 지우지 않고 reverted_at으로 표시한다 */
export const gradeAdjustments = pgTable(
  "grade_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => reviewCycles.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => cyclePeople.id, { onDelete: "cascade" }),
    fromGrade: text("from_grade", { enum: ["S", "A", "B", "C", "D"] }).notNull(),
    toGrade: text("to_grade", { enum: ["S", "A", "B", "C", "D"] }).notNull(),
    kind: text("kind", { enum: ["manual", "push"] }).notNull(),
    batchId: uuid("batch_id").notNull(),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("grade_adjustments_cycle_idx").on(t.cycleId, t.createdAt)],
);
