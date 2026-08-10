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
- Simplified (non-scoring) track selection: audio picks the preferred
  language's default-flagged track, skipping commentary; subtitles default
  to **burn mode**, burning in every non-commentary subtitle track in the
  preferred language (so split dialogue/signs-songs tracks both get burned
  in without needing keyword-based signs/songs detection), falling back to
  copy mode (same "every matching track" rule) if none are burnable, or
  "none" if there are no subtitle tracks at all (`src/media/trackSelection.ts`).
  A human-readable reason is shown in the UI.
- `SubtitleSelection.trackIndexes` is used for both copy and burn mode (burn
  can hold multiple tracks now — chained as multiple `subtitles=...` filters
  in the ffmpeg `-vf` arg, in `src/media/ffmpegCommand.ts`). The old
  single-track `burnTrackIndex` field and scoring-based heuristics
  (forced/signs-songs/SDH keyword weighting) were deleted per user request
  ("don't be so clever").
- Manual override of audio track, subtitle track(s) (checkboxes, both modes
  support multi-select now), subtitle mode (copy/burn/none), and preset per
  file.
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
- Plex-friendly output naming: files are grouped by their immediate source
  folder; each group gets an editable Show Name (auto-guessed from the
  folder name), Season, and Starting Episode. Each file's Episode/Movie/Extra
  kind defaults from duration (`src/media/plexNaming.ts`:
  `classifyByDuration`, movie >= 60min, extra <= 5min) and is manually
  overridable, as is the final output filename (a plain editable text field
  in the "Plex naming" section of File Details, pre-filled with the computed
  suggestion). Episode/extra numbers are assigned sequentially per group via
  `assignSequenceNumbers`, skipping movies. Output path becomes
  `<outputRoot>/<ShowName>/<ShowName> - sSSeEE.mkv` (or `.../Extras/<ShowName>
  - extra-NN.mkv`, or `.../<ShowName>.mkv` for movies), computed in
  `computeOutputPath`'s new `plexPath` branch (`src/media/outputPaths.ts`),
  which takes over from the existing preserve-source-structure mirroring when
  present and sanitizes every segment server-side regardless of what the
  renderer sent. Verified end-to-end against the real `d:\Video` tree (see
  `git log` for the commit) via a scratch script driving the real
  discover/probe/naming pipeline — not just unit tests — confirming the
  K-ON movie/extras and Robotech Extras file are correctly classified. Not
  yet exercised by clicking through the actual Electron UI.
- Post-implementation code review (Codex) on the Plex naming feature found
  and fixed: episode numbering silently shifting when completed/encoding
  items or failed probes were excluded from the numbering set (fixed by
  extracting `src/state/plexRecompute.ts` — numbering now always considers
  every successfully probed item regardless of status, while only
  non-in-progress items get their output path/status actually rewritten);
  a race where rapid edits (e.g. typing in the Show Name field) could let an
  older recompute's IPC round-trip overwrite a newer one, and where
  `onStartQueue` could silently drop an item stuck with a stale "conflict"
  status instead of giving it a chance to revalidate (fixed via a
  generation-counter guard in `recomputeAllOutputPaths` and broadening
  `onStartQueue`'s candidate selection to revalidate rather than trust
  stored status); and unvalidated season/start-episode numeric input
  (fixed via `normalizePositiveInteger` in `plexNaming.ts`, applied both at
  the input boundary and defensively inside filename padding). One review
  finding was evaluated and intentionally not changed: separate disc-rip
  folders (e.g. `K-ONComplete18 BD-1`, `BD-2`) default to the same guessed
  show name and both start at s01e01, which is the direct consequence of
  the user's explicit choice (this session) for manual per-folder
  season/start-episode rather than automatic cross-folder coordination;
  conflict detection already prevents any silent overwrite, and the
  workflow is to bump each subsequent folder's starting episode by hand.

- Queue list now shows, per file, a colored kind tag (Episode/Movie/Extra,
  `src/components/QueueList.tsx` `KindTag`) alongside the status badge, and a
  source → destination filename preview line, so grouping/naming can be
  sanity-checked without clicking into each file.
- Multi-select in the queue list (Ctrl/Cmd+click to toggle, Shift+click for a
  range; state lives in `useAppController`'s `selectedIds`/`onSelect`).
  Selecting more than one file swaps the detail panel for
  `src/components/BulkEditPanel.tsx`, which can set Kind or Season across all
  selected files at once (`onBulkChangeKind`/`onBulkChangeSeason` in
  `useAppController.ts`; season writes to each selected item's owning Plex
  group, kind writes directly to each item). Not yet clicked through in the
  running Electron app — only typechecked/built.

155 unit tests pass (`npm test`), covering ffprobe normalization, track
selection heuristics, ffmpeg argument generation, output path preservation/
conflict detection (including real filesystem case-sensitivity probing),
burn-track selection, sequential-queue/concurrency guarding, progress
parsing, settings parsing, tool discovery, recursive file discovery, and
Plex naming (folder-name cleanup, duration classification, sequence
numbering, sanitization against path traversal, numeric input clamping, and
the stable-numbering-across-status-changes orchestration in
`plexRecompute.test.ts`). Typecheck and build (renderer + main) are clean.

Three independent code-review passes (Codex) since the initial slice found
and fixed: nested-output-folder creation before encode, burn-in subtitle
index math (`si=` must be the subtitle-relative ordinal, not the ffprobe
global stream index), rejection of burn-in for image-based (PGS/DVD/DVB)
subtitle codecs the `subtitles` filter can't render (with the UI disabling
those tracks, and the Burn option itself, when unsupported), tool-path
resolution consistency between the Settings status check and actual
probe/encode invocation, pre-encode revalidation of output destinations plus
duplicate-destination detection across the queue, a renderer + main-process
guard against double-clicking Start Queue into two concurrent ffmpeg runs,
scanning every currently-selected subtitle track (not just the first) for a
burnable one when switching from Copy to Burn mode, and replacing an
OS-based case-sensitivity guess with an actual probe of the chosen output
directory (`src/media/caseSensitivity.ts`, via a new
`files:checkCaseSensitivity` IPC call).

A fourth review pass (against the multi-select/bulk-edit + Plex naming code)
found and fixed:
- Naming/output-path controls (Plex toggle, show name, kind, season, start
  episode, filename override) in `FileDetails.tsx` and `BulkEditPanel.tsx`
  were still editable while a queue was starting/encoding, even though the
  full queue (including resolved output paths) is submitted to the main
  process up front — an edit to a not-yet-started item would change what the
  UI showed without changing what ffmpeg actually wrote to. Fixed by
  disabling those controls whenever `isEncoding || isStarting`
  (`namingLocked` prop threaded from `App.tsx`).
- `cancelCurrentEncode` (`electron/ipc/encoding.ts`) only killed the running
  process if the renderer-supplied id matched `running.id` exactly; in the
  brief window right as one queue item finishes and the next starts, the
  renderer can still show the old id as "encoding" (state updates land on
  the next render, not synchronously), making a cancel click in that window
  a silent no-op. Fixed by gating on `queueActive` and cancelling whatever
  is currently running, ignoring the passed id (there is only ever one
  current item to cancel). Covered by new tests in `encoding.test.ts`.
- `canStartQueue` used a hand-rolled `status === "ready"` check that had
  drifted from the actual candidate-eligibility logic
  (`startQueueCandidates`, which already treats `cancelled` items as
  startable) — so after cancelling a queue, the Start Queue button stayed
  disabled with no way back in except re-adding files. Fixed by deriving
  `canStartQueue` from `startQueueCandidates` plus an output-directory
  check, so it now matches what `onStartQueue` actually accepts.
- Bulk "Set season" in `BulkEditPanel.tsx` applies to the whole Plex naming
  group (per source folder), not just the selected files, but was labeled
  "Apply to selected" — silently renaming unselected sibling files. Kept the
  per-folder data model (an intentional design from the original Plex naming
  work) but relabeled the control ("Set season for folder(s)" / "Apply to
  folder(s)") and added a note showing exactly how many files/folders will
  be touched, via a new `getBulkSeasonImpact` helper in `useAppController.ts`.

## Running / packaging

- `run.bat` (repo root) launches the dev build.
  `release\Anime Plex Converter *.exe` exists it starts that directly,
  otherwise it falls back to `npm install` (first run) + `npm run dev:electron`.
- `npm run package` builds a standalone Windows portable `.exe` via
  electron-builder (config lives in the `"build"` key of `package.json`) into
  `release/`. It always runs `npm run build` first, so the packaged exe can
  never go stale relative to source.
- `npm run verify` chains `typecheck` → `test` → `package`, so running it
  regenerates the packaged exe from current source as part of validating a
  change. Packaging is not part of the plain `npm test` vitest run (it's slow
  and downloads electron/nsis assets), only of `verify`/`package`.
- `release/` is gitignored; the exe is a build artifact, not committed.

## Known limitations / not yet done

- Plex naming UI (the new "Plex naming" section in File Details) has not
  been clicked through in the running Electron app — only unit tests and a
  scratch script exercising the underlying pure logic against real
  `d:\Video` files. Next session should launch `npm run dev:electron`, add
  `d:\Video`, and confirm the fields render/update as expected, including
  editing a Show Name and watching sibling files' suggestions update.
- No installer (NSIS/MSI) or auto-update — current target is `portable`
  (single self-contained .exe), which was sufficient for local use.
- No app icon set — packaged exe currently uses the default Electron icon.
- No code signing — Windows SmartScreen may warn on first run of the exe.
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
- Case-sensitivity detection for duplicate-destination checking
  (`src/media/caseSensitivity.ts`) probes the actual chosen output directory
  (writes and looks up a differently-cased marker file) rather than guessing
  from the OS, so it should be correct for case-sensitive macOS/Windows
  volumes and network shares too — but it has only been exercised via mocked
  `fs`, not against a real case-sensitive volume.
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
4. Add ability to remove items from the list of pending videos (queue list).

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
