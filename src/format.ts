export function formatDuration(totalSeconds: number | undefined): string {
  if (totalSeconds === undefined || !Number.isFinite(totalSeconds)) return "—";

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  const pad = (n: number) => String(n).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function formatPercent(percent: number | undefined): string {
  return percent === undefined ? "—" : `${percent.toFixed(0)}%`;
}

export function formatSpeed(speed: number | undefined): string {
  return speed === undefined ? "—" : `${speed.toFixed(2)}x`;
}
