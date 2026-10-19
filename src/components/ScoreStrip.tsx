/**
 * 내가 준 점수 분포 (2026-10-19): 70~90점 축 위에 사람마다 점 하나, 초록 띠 = 평균 기준(79.5~80.5), 점선 = 지금 평균.
 * 점에 마우스를 올리면 이름·점수(title). 이름은 점 위아래로 번갈아 붙여 겹침을 줄인다.
 */
export function ScoreStrip({ people }: { people: { name: string; total: number }[] }) {
  const W = 640;
  const H = 150;
  const l = 24;
  const r = 24;
  const lo = Math.min(70, Math.floor(Math.min(...people.map((p) => p.total), 70) / 5) * 5);
  const hi = Math.max(90, Math.ceil(Math.max(...people.map((p) => p.total), 90) / 5) * 5);
  const x = (v: number) => l + ((v - lo) / (hi - lo)) * (W - l - r);
  const avg = people.length ? people.reduce((a, p) => a + p.total, 0) / people.length : null;
  const ticks = Array.from({ length: (hi - lo) / 5 + 1 }, (_, i) => lo + i * 5);
  const sorted = [...people].sort((a, b) => a.total - b.total);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={`내가 준 점수 분포: ${sorted.map((p) => `${p.name} ${p.total.toFixed(1)}`).join(", ")}`} data-testid="score-strip">
      <rect x={x(79.5)} y={24} width={x(80.5) - x(79.5)} height={74} rx={4} className="fill-hl-green-bg stroke-hl-green" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={24} y2={98} className="stroke-border" />
          <text x={x(t)} y={118} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {t}
          </text>
        </g>
      ))}
      <line x1={l} x2={W - r} y1={98} y2={98} className="stroke-border" />
      {avg !== null && (
        <g>
          <line x1={x(avg)} x2={x(avg)} y1={16} y2={98} className="stroke-foreground" strokeWidth={2} strokeDasharray="3 3" />
          <text x={x(avg)} y={11} textAnchor="middle" className="fill-foreground text-[11px] font-bold">
            평균 {avg.toFixed(1)}
          </text>
        </g>
      )}
      {sorted.map((p, i) => {
        const y = i % 2 ? 72 : 50;
        return (
          <g key={p.name}>
            <title>{`${p.name} ${p.total.toFixed(1)}점`}</title>
            <circle cx={x(p.total)} cy={y} r={8} className="fill-brand stroke-card" strokeWidth={2} />
            <text x={x(p.total)} y={i % 2 ? y + 22 : y - 14} textAnchor="middle" className="fill-text-secondary text-[11px]">
              {p.name}
            </text>
          </g>
        );
      })}
      <text x={l} y={H - 6} className="fill-muted-foreground text-[11px]">
        점수 (역량×30% + 업적×70%)
      </text>
    </svg>
  );
}
