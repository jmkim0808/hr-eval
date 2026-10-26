// 부서별 진행 막대 (관리자 진행 현황·대표이사 진행 현황 함께 씀)
export function DeptBars({ depts }: { depts: { department: string; total: number; done: number }[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {depts.map((d) => {
        const pct = Math.round((d.done / d.total) * 100);
        return (
          <li key={d.department} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-body" title={`${d.department} · ${d.done}/${d.total}명 · 남은 ${d.total - d.done}명`}>
            <span className="truncate">{d.department}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{pct}%</span>
          </li>
        );
      })}
    </ul>
  );
}
