/**
 * 역량 × 업적 9칸 표 (2026-10-19, 관리자·대표이사 전용). 1차 점수 기준, 점 하나 = 한 사람.
 * 가로 = 역량(100점), 세로 = 업적(10점). 칸 경계는 축을 셋으로 나눈 값. 점에 마우스를 올리면 이름·부서·점수(title).
 */
export function NineBox({ people }: { people: { name: string; department: string; competency: number; achievement: number }[] }) {
  const W = 460;
  const H = 340;
  const l = 44;
  const r = 12;
  const t = 12;
  const b = 42;
  const cx = [50, 100];
  const cy = [5, 10];
  const x = (v: number) => l + ((Math.min(cx[1]!, Math.max(cx[0]!, v)) - cx[0]!) / (cx[1]! - cx[0]!)) * (W - l - r);
  const y = (v: number) => t + (1 - (Math.min(cy[1]!, Math.max(cy[0]!, v)) - cy[0]!) / (cy[1]! - cy[0]!)) * (H - t - b);
  const xs = [50, 66.7, 83.3, 100];
  const ys = [5, 6.67, 8.33, 10];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={`역량 대비 업적 9칸 표, ${people.length}명`} data-testid="nine-box">
      {[0, 1, 2].map((ri) =>
        [0, 1, 2].map((ci) => {
          const top = ri === 2 && ci === 2;
          return (
            <rect
              key={`${ri}${ci}`}
              x={x(xs[ci]!) + 1.5}
              y={y(ys[ri + 1]!) + 1.5}
              width={x(xs[ci + 1]!) - x(xs[ci]!) - 3}
              height={y(ys[ri]!) - y(ys[ri + 1]!) - 3}
              rx={8}
              className={top ? "fill-accent" : "fill-muted"}
            />
          );
        }),
      )}
      <text x={x(83.3) + 8} y={y(10) + 18} className="fill-accent-foreground text-[11px] font-bold">
        역량·업적 모두 높음
      </text>
      <text x={x(50) + 8} y={y(6.67) - 8} className="fill-muted-foreground text-[11px] font-bold">
        모두 낮음
      </text>
      {[50, 60, 70, 80, 90, 100].map((v) => (
        <text key={v} x={x(v)} y={H - b + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
          {v}
        </text>
      ))}
      {[5, 6, 7, 8, 9, 10].map((v) => (
        <text key={v} x={l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
          {v}
        </text>
      ))}
      <text x={(W + l) / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        역량 (100점)
      </text>
      <text x={12} y={(H - b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(H - b) / 2})`} className="fill-muted-foreground text-[11px]">
        업적 (10점)
      </text>
      {people.map((p) => (
        <g key={`${p.name}-${p.department}`}>
          <title>{`${p.name} · ${p.department || "—"} · 역량 ${p.competency.toFixed(1)} · 업적 ${p.achievement.toFixed(1)}`}</title>
          <circle cx={x(p.competency)} cy={y(p.achievement)} r={6.5} className="fill-brand stroke-card" strokeWidth={2} />
        </g>
      ))}
    </svg>
  );
}
