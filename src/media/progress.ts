export interface FfmpegProgressEvent {
  frame: number | undefined;
  fps: number | undefined;
  bitrateKbps: number | undefined;
  outTimeSeconds: number | undefined;
  speed: number | undefined;
  status: "continue" | "end";
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBitrateKbps(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /^([\d.]+)kbits\/s$/.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]);
}

function parseSpeed(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /^([\d.]+)x$/.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]);
}

function parseBlock(block: string): FfmpegProgressEvent {
  const fields = new Map<string, string>();
  for (const line of block.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    fields.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }

  const outTimeUs = toNumber(fields.get("out_time_us"));

  return {
    frame: toNumber(fields.get("frame")),
    fps: toNumber(fields.get("fps")),
    bitrateKbps: parseBitrateKbps(fields.get("bitrate")),
    outTimeSeconds: outTimeUs !== undefined ? outTimeUs / 1_000_000 : undefined,
    speed: parseSpeed(fields.get("speed")),
    status: fields.get("progress") === "end" ? "end" : "continue",
  };
}

/**
 * Incrementally parses ffmpeg's `-progress pipe:1` output, which arrives as
 * a stream of `key=value` lines with each block terminated by a
 * `progress=continue` or `progress=end` line. Handles output split across
 * arbitrary chunk boundaries (as stdout data events do in practice).
 */
export function createProgressParser() {
  let buffer = "";

  return {
    feed(chunk: string): FfmpegProgressEvent[] {
      buffer += chunk;
      const events: FfmpegProgressEvent[] = [];

      let progressLineStart = buffer.indexOf("progress=");
      while (progressLineStart !== -1) {
        const lineEnd = buffer.indexOf("\n", progressLineStart);
        if (lineEnd === -1) break;

        const block = buffer.slice(0, lineEnd + 1);
        buffer = buffer.slice(lineEnd + 1);
        events.push(parseBlock(block));

        progressLineStart = buffer.indexOf("progress=");
      }

      return events;
    },
  };
}

export interface EncodeProgress {
  percent: number | undefined;
  elapsedSeconds: number;
  speed: number | undefined;
  etaSeconds: number | undefined;
}

/**
 * Derives user-facing progress (percent complete, ETA) from a single
 * ffmpeg progress event plus the file's known duration and how long
 * encoding has been running.
 */
export function computeEncodeProgress(
  event: FfmpegProgressEvent,
  durationSeconds: number | undefined,
  elapsedSeconds: number,
): EncodeProgress {
  const percent =
    durationSeconds !== undefined && durationSeconds > 0 && event.outTimeSeconds !== undefined
      ? Math.min(100, Math.max(0, (event.outTimeSeconds / durationSeconds) * 100))
      : undefined;

  const remainingSeconds =
    durationSeconds !== undefined && event.outTimeSeconds !== undefined
      ? Math.max(0, durationSeconds - event.outTimeSeconds)
      : undefined;

  const etaSeconds =
    remainingSeconds !== undefined && event.speed !== undefined && event.speed > 0
      ? remainingSeconds / event.speed
      : undefined;

  return { percent, elapsedSeconds, speed: event.speed, etaSeconds };
}
