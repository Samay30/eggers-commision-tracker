export function StatusBadge({ status }: { status: string }) {
  if (status === 'PAID') return <span className="badge green">✓ Paid</span>;
  if (status === 'PENDING') return <span className="badge yellow">● Pending</span>;
  if (status === 'CANCELED') return <span className="badge red">Canceled</span>;
  return <span className="badge gray">{status}</span>;
}
