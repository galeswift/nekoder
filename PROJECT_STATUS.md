# Project Status

## What this is

Anime Video Converter for Plex — Electron + React + TypeScript + Vite desktop
app for converting MakeMKV anime rips into Plex-friendly files. Built from the
brief in `README.md`, following the working agreements in `CLAUDE.md`.

## Current state: first vertical slice complete

All milestones from the brief's "First milestone" section are implemented and
wired end-to-end:

- Electron app launches (`npm run dev:electron`), loads the React UI, verified
  visually by the user on 2026-08-09.
- ffmpeg/ffprobe discovery: checks configured settings path, then PATH,
  validates with `-version`; Settings modal opens automatically if either is
  missing, with Browse buttons to configure paths.
- Add individual files or a folder (recursive `.mkv` discovery, arbitrary
  nesting depth).
- ffprobe probing + normalization into app-owned `MediaFile` types.
- Anime-specific track selection heuristics (Japanese audio, English
  full-dialogue subtitles, commentary/signs-songs/forced avoidance) with a
  human-readable reason shown in the UI.
- Manual override of audio track, subtitle track(s), subtitle mode
  (copy/burn/none), and preset per file.
- Three presets: Plex Compatible H.264, Plex HEVC, Remux/Copy.
- ffmpeg argument generation as a `string[]` (never a shell string), spawned
  directly — no shell invocation anywhere.
- Output path preservation (mirrors source folder structure under the chosen
  output directory) with pre-encode conflict detection (marks item
  "Conflict" instead of silently overwriting).
- Sequential queue execution, `-progress pipe:1` parsed into percent/elapsed
  /speed/ETA, shown per queue item.
- Cancel current encode (kills the active ffmpeg child process).
- Expandable log panel (ffmpeg/ffprobe invocations, stderr, errors).
- Settings persisted as JSON under `app.getPath("userData")`.

94 unit tests pass (`npm test`), covering ffprobe normalization, track
selection heuristics, ffmpeg argument generation, output path preservation/
conflict detection (including cross-platform case sensitivity), burn-track
selection, sequential-queue/concurrency guarding, progress parsing, settings
parsing, tool discovery, and recursive file discovery. Typecheck and build
(renderer + main) are clean.

Two independent code-review passes (Codex) since the initial slice found and
fixed: nested-output-folder creation before encode, burn-in subtitle index
math (`si=` must be the subtitle-relative ordinal, not the ffprobe global
stream index), rejection of burn-in for image-based (PGS/DVD/DVB) subtitle
codecs the `subtitles` filter can't render (with the UI disabling those
tracks in burn mode), tool-path resolution consistency between the Settings
status check and actual probe/encode invocation, pre-encode revalidation of
output destinations plus duplicate-destination detection across the queue,
a renderer + main-process guard against double-clicking Start Queue into two
concurrent ffmpeg runs, and preferring the user's already-selected subtitle
track (over the first burnable one) when switching from Copy to Burn mode.

## Known limitations / not yet done

- No packaging (electron-builder) — deferred by explicit user decision on
  2026-08-09; only `npm run dev` / `build` / typecheck / test exist.
- No automated UI/component tests (React Testing Library) — per the brief,
  core logic testing was prioritized over UI testing for the first slice.
  React-hook logic that needed regression coverage (burn-track selection,
  duplicate-destination detection) was extracted into plain, hook-free
  modules under `src/state/` so it could still be unit-tested without a DOM.
- Subtitle burn-in (`-vf subtitles=...`) is implemented in
  `src/media/ffmpegCommand.ts` and wired into the UI/main process, with
  image-based (PGS/DVD/DVB) codecs explicitly rejected rather than silently
  producing a broken filter, but it has not been exercised against a real
  ASS/PGS file end-to-end.
- No real-media end-to-end encode has been run yet (no sample MKV available
  in this session) — only the dev-mode window launch was visually verified.
- Case-sensitive-filesystem detection for duplicate-destination checking
  (`conflictDetection.ts`) guesses from `navigator.userAgent` since renderer
  code can't call `node:os` directly; it hasn't been verified on an actual
  Linux/macOS filesystem, only reasoned about.
- `AGENTS.md`, `CLAUDE.md`, and `README.md` in the repo root are maintained
  directly by the user (README.md currently holds the original project brief,
  not yet the practical developer README described in the brief's
  "Documentation" section) — do not overwrite them without asking first.

## Next steps

1. Test against a real MakeMKV-ripped file to validate track selection and
   an actual ffmpeg encode (H.264, HEVC, remux, and burn-in).
2. Ask the user whether/how to turn `README.md` into the practical developer
   doc described in the brief (prerequisites, commands, architecture) without
   losing the original brief content they intentionally placed there.
3. Consider electron-builder packaging once the app has seen real use.

## Architecture notes for a fresh session

- Pure, Electron-free logic lives in `src/media/*` and `src/settings/types.ts`
  — fully unit-tested, no Node/Electron dependency where avoidable (path/fs
  built-ins are used directly and tested against real temp dirs, not mocked).
- `src/ipc/api.ts` is the single shared contract (types + channel names)
  between preload and renderer — imported by both.
- Electron main process mechanics (dialogs, spawn, fs) live in `electron/`;
  `electron/ipc/*.ts` wire the pure logic to real IO.
- `src/state/useAppController.ts` is the renderer-side orchestration hook —
  it's the only place that calls `window.desktop.*` and holds queue state.
  Renderer code must never import `node:*` modules directly (breaks the Vite
  browser build); anything needing Node APIs goes through an IPC call instead
  (see `resolveOutputPath` for the pattern used after hitting this once).
