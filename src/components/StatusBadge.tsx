import type { QueueItemStatus } from "../state/queueItem";

const LABELS: Record<QueueItemStatus, string> = {
  pending: "Pending",
  probing: "Probing",
  ready: "Ready",
  encoding: "Encoding",
  complete: "Complete",
  error: "Error",
  conflict: "Conflict",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: QueueItemStatus }) {
  return <span className={`status-badge status-${status}`}>{LABELS[status]}</span>;
}
