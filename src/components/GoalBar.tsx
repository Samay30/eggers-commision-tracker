export function GoalBar({
  label,
  value,
  goal,
  display
}: {
  label: string;
  value: number;
  goal: number;
  display: (n: number) => string;
}) {
  const hasGoal = goal > 0;
  const progress = hasGoal ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return (
    <div className="card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{display(value)}</div>
      <div className="kpi-sub">{hasGoal ? `of ${display(goal)} goal` : 'no goal set'}</div>
      <div className="progress" style={{ marginTop: 12 }}>
        <div style={{ width: `${progress}%` }} />
      </div>
      <div className="kpi-sub" style={{ marginTop: 6 }}>{hasGoal ? `${progress}%` : '—'}</div>
    </div>
  );
}
