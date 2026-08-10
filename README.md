# Anime Plex Converter

A small desktop app for converting anime MKV rips into Plex-friendly files. It
uses Electron, React, TypeScript, and the locally installed `ffmpeg` and
`ffprobe` tools.

The app can scan nested folders, inspect media tracks, automatically select
Japanese audio and English subtitles, and process files through a sequential
encoding queue.

## Features

- Add individual MKV files or recursively scan folders
- Inspect video, audio, and subtitle tracks
- Automatically select anime-friendly audio and subtitle tracks
- Override track selections for each file
- Encode using H.264, HEVC, or remux/copy presets
- Copy, burn, or omit subtitles
- Preserve the source folder structure in the output directory
- Display encoding progress, logs, errors, and output conflicts
- Cancel the current encode

## Prerequisites

- A current Node.js LTS release with npm
- `ffmpeg` and `ffprobe`

The media tools may be available on `PATH` or selected manually in the app's
Settings window. They are not bundled or downloaded automatically.

## Setup

```bash
npm install
```

## Development

Launch the Electron app with the Vite development server:

```bash
npm run dev:electron
```

Run only the renderer development server:

```bash
npm run dev
```

## Tests and validation

```bash
npm test
npm run typecheck
npm run build
```

For watch-mode tests:

```bash
npm run test:watch
```

The production build is written to `dist/` and `dist-electron/`. Application
packaging and installers are not implemented yet.

## Architecture

```text
React renderer
      |
      | typed IPC through preload/contextBridge
      v
Electron main process
      |
      +-- filesystem and native dialogs
      +-- ffprobe media inspection
      +-- ffmpeg encoding
```

Core media policy is implemented as testable TypeScript outside React and
Electron. The renderer has no direct Node.js access; native operations are
exposed through a small preload API.

Important locations:

- `src/components/` — React UI components
- `src/media/` — media types, track selection, command generation, and progress parsing
- `src/state/` — renderer queue and application state
- `src/ipc/api.ts` — shared typed IPC contract
- `electron/` — Electron main process, preload script, and IPC handlers

## Settings

Settings are stored as JSON in Electron's platform-specific `userData`
directory. They include the selected media-tool paths, output directory,
language preferences, preset, and folder-structure preference.

## Project documentation

- [Project brief](PROJECT_BRIEF.md) — product requirements and engineering constraints
- [Project status](PROJECT_STATUS.md) — current implementation state, limitations, and next steps

## Current limitations

- No packaged installer or distributable build
- No automatic `ffmpeg` download
- No parallel encoding
- Real-media validation is still recommended before relying on production encodes
