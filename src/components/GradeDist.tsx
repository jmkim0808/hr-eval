import { GRADES, type Grade } from "@/domain/grading";

/**
 * 등급 분포 · 기준 대비 (2026-10-19, 대표이사·관리자): 점선 테두리 = 상대평가 기준 인원, 채운 막대 = 지금(대표이사 조정 포함).
 * 기준과 다르면 막대 위에 +n / −n. 막대에 마우스를 올리면 숫자(title).
 */
export function GradeDist({ base, now }: { base: Record<Grade, number>; now: Record<Grade, number> }) {
  const W = 460;
  const H = 230;
  const l = 28;
  const b = 30;
  const t = 18;
  const bw = 54;
  const max = Math.max(1, ...GRADES.map((g) => Math.max(base[g], now[g])));
  const gap = (W - l - GRADES.length * bw) / GRADES.length;
  const y = (v: number) => t + (1 - v / max) * (H - t - b);
  const step = max <= 5 ? 1 : Math.ceil(max / 5);
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-56 w-full overflow-visible" role="img" aria-label={`등급 분포: ${GRADES.map((g) => `${g} 기준 ${base[g]}명 지금 ${now[g]}명`).join(", ")}`} data-testid="grade-dist">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={l} x2={W} y1={y(v)} y2={y(v)} className="stroke-border" />
          <text x={l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
            {v}
          </text>
        </g>
      ))}
      {GRADES.map((g, i) => {
        const x = l + gap / 2 + i * (bw + gap);
        const diff = now[g] - base[g];
        return (
          <g key={g}>
            <title>{`${g}등급 · 기준 ${base[g]}명 · 지금 ${now[g]}명`}</title>
            {now[g] > 0 && <path d={`M${x + 6},${y(0)} V${y(now[g]) + 4} q0,-4 4,-4 H${x + bw - 10} q4,0 4,4 V${y(0)} Z`} className="fill-brand" />}
            {base[g] > 0 && <rect x={x} y={y(base[g])} width={bw} height={y(0) - y(base[g])} rx={4} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="4 3" />}
            <text x={x + bw / 2} y={H - 9} textAnchor="middle" className="fill-foreground text-[13px] font-extrabold">
              {g}
            </text>
            {diff !== 0 && (
              <text x={x + bw / 2} y={y(Math.max(now[g], base[g])) - 6} textAnchor="middle" className="fill-foreground text-[12px] font-bold">
                {diff > 0 ? `+${diff}` : `−${-diff}`}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
