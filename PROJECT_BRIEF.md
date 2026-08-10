# Project Brief: Anime Video Converter for Plex

Build a small, polished, cross-platform desktop app for converting anime Blu-ray/DVD rips into Plex-friendly video files.

I am an experienced programmer with roughly 25 years of development experience, including C++, game development, React, WPF, and WinForms.

Do not over-explain basic programming concepts.

Prefer simple, direct architecture and readable code over excessive abstraction.

This project should optimize for:

* fast iteration
* low dependency count
* testability
* clear architecture
* easy debugging
* strong regression protection
* minimal framework magic

---

# Technology

Use:

* Electron
* React
* TypeScript
* Vite
* standard CSS or lightweight CSS organization
* Node.js built-in APIs
* ffmpeg
* ffprobe

Target:

* Windows first
* macOS and Linux should remain viable
* desktop only
* no mobile support

Do not use Rust.

Do not introduce another backend language.

Keep almost the entire project in TypeScript.

---

# Core architecture

Use a conventional Electron architecture:

```text
React renderer
      |
      | IPC
      v
Electron main process
      |
      +-- Node filesystem APIs
      +-- Node path APIs
      +-- child_process
      +-- Electron native dialogs
      |
      +-- ffprobe
      +-- ffmpeg
```

Use Electron's preload/contextBridge mechanism for renderer-to-main communication.

Do not enable unrestricted Node access in the renderer.

Use:

* contextIsolation: true
* nodeIntegration: false

Expose a small, explicit API from preload.

For example:

```ts
window.desktop.openFolder()
window.desktop.openFiles()
window.desktop.probeMedia(path)
window.desktop.startEncode(request)
window.desktop.cancelEncode(id)
```

Keep IPC narrow and typed.

---

# Primary goal

The app is for taking MKV files ripped from anime Blu-rays with MakeMKV and creating Plex-friendly versions.

The primary workflow is:

1. Select one or more MKV files, or a folder.
2. Recursively discover MKVs inside nested folders.
3. Run ffprobe on each file.
4. Detect:

   * video tracks
   * audio tracks
   * subtitle tracks
   * languages
   * codecs
   * titles
   * default flags
   * forced flags
5. Automatically make sensible anime-specific track selections.
6. Let the user review or override them.
7. Choose an encoding/remux preset.
8. Generate an ffmpeg argument list.
9. Queue one or more files.
10. Execute conversions sequentially.
11. Show progress.
12. Write output files to a chosen destination.
13. Preserve folder structure by default.
14. Produce output suitable for Plex and common Plex clients.

---

# UX philosophy

This should feel like a purpose-built desktop utility, not a generic ffmpeg GUI.

Prioritize:

* very few clicks
* good defaults
* batch processing
* nested-folder support
* clear track selection
* easy visibility into automatic choices
* easy correction when metadata is wrong
* compact desktop-style layout
* keyboard-friendly interaction

Avoid:

* giant mobile-style controls
* excessive whitespace
* elaborate dashboards
* unnecessary animation
* overly abstract UI frameworks

The visual style should be modern, clean, and compact, similar to a good developer tool.

---

# Main window

Use approximately this layout.

## Top toolbar

Include:

* Add Files
* Add Folder
* Output Folder
* Start Queue
* Cancel Current Encode
* Settings

Pause/resume is optional and should only be added if it remains simple and reliable.

---

# File / queue list

On the left side, show imported files.

Each item should show:

* filename
* status
* selected Japanese audio track
* selected English subtitle track
* duration
* encoding progress
* success/error state

Allow selecting one file to inspect or edit its settings.

Support states such as:

```text
Pending
Probing
Ready
Encoding
Complete
Error
Conflict
Cancelled
```

Keep this as a simple explicit state model.

Do not introduce a generic state machine library.

---

# Selected file details

For the selected video, show:

## Source

* filename
* full path
* resolution
* duration
* video codec

## Audio tracks

Show all audio tracks in a compact table/list.

Include:

* stream index
* language
* codec
* channel count
* channel layout
* title
* default flag

Automatically prefer Japanese audio.

Allow manual override.

## Subtitle tracks

Show all subtitle tracks.

Include:

* stream index
* language
* codec
* title
* forced flag
* default flag

Automatically prefer English subtitles.

Allow:

* one subtitle track
* multiple subtitle tracks if needed
* no subtitles

---

# Anime-specific track selection

This is a major part of the application.

Anime files frequently contain:

* Japanese audio
* English dubs
* commentary audio
* multiple English PGS tracks
* full dialogue subtitles
* signs/songs subtitles
* forced-only subtitles
* poorly named or incorrectly tagged tracks

Create explicit heuristics for track selection.

Put them in a pure TypeScript module, for example:

```text
src/media/trackSelection.ts
```

Do not bury this logic in React components or Electron IPC code.

## Audio preference

Rough priority:

1. Japanese language.
2. Avoid commentary tracks.
3. Prefer default Japanese track when reasonable.
4. Prefer normal program audio over alternate mixes/commentaries.
5. Fall back gracefully if language metadata is missing.

## Subtitle preference

Rough priority:

1. English.
2. Prefer full-dialogue subtitle tracks.
3. Prefer non-forced over forced-only.
4. Avoid commentary subtitles.
5. Avoid signs/songs-only tracks unless no better English track exists.
6. Fall back gracefully when metadata is incomplete.

Use metadata such as:

* language
* title
* forced disposition
* default disposition

Do not assume metadata is correct.

Use conservative string heuristics for titles like:

```text
commentary
signs
songs
signs & songs
forced
dub
SDH
```

Make these rules easy for me to modify.

Track selection should return:

* selected track
* a machine-readable score/reason if useful
* a human-readable explanation

For example:

```text
Selected stream 4 because it is English, non-forced, non-commentary,
and appears to be the full subtitle track.
```

Display the reason somewhere unobtrusive in the UI.

---

# ffprobe integration

Use ffprobe JSON output.

Do not distribute raw ffprobe JSON throughout the app.

Normalize it into application-owned TypeScript types.

For example:

```ts
interface MediaFile {
  path: string;
  durationSeconds: number;
  videoTracks: VideoTrack[];
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
}
```

Define types such as:

```text
MediaFile
VideoTrack
AudioTrack
SubtitleTrack
TrackDisposition
```

Capture useful fields including:

* index
* codec
* language
* title
* default
* forced
* channels
* channel layout
* width
* height
* duration

Handle missing metadata safely.

Do not assume every ffprobe field exists.

Put normalization in a pure TypeScript module such as:

```text
src/media/ffprobe.ts
```

or split process invocation and parsing if that is clearer.

The actual child-process invocation belongs in the Electron main process.

The normalization logic should remain pure and unit-testable.

---

# ffmpeg command generation

Do not construct ffmpeg commands inside React components.

Create something like:

```text
src/media/ffmpegCommand.ts
```

Represent settings using structured TypeScript objects.

Generate:

```ts
string[]
```

for process arguments.

Do not build one giant shell command string.

Use:

```ts
spawn(ffmpegPath, args)
```

rather than invoking a shell.

This is important for:

* paths containing spaces
* unusual characters
* predictable argument handling

Make it easy to inspect and log both:

* executable
* argument array

---

# Encoding presets

Keep presets simple and data-driven.

Use plain TypeScript or JSON.

Include at least:

## Plex Compatible H.264

Prioritize compatibility.

Example intent:

* H.264 video
* sensible CRF
* reasonable encoder preset
* AAC or AC3 audio
* MKV output
* selected subtitles preserved where practical

## Plex HEVC

Prioritize smaller files.

Example intent:

* H.265 / HEVC
* sensible CRF
* preserve selected subtitle tracks
* MKV output

## Remux / Copy

Prioritize no unnecessary transcoding.

Example intent:

* copy video
* copy compatible audio
* copy subtitles
* MKV output

Keep preset definitions easy to modify.

Do not create a plug-in framework.

---

# Subtitle handling

Support at minimum:

* copy subtitle stream
* burn subtitle into video
* omit subtitles

Extract subtitle support is useful if easy, but not required for the first vertical slice.

Preserve PGS subtitles in MKV where practical.

Do not automatically burn subtitles unless the selected preset or user explicitly asks for it.

---

# Audio handling

Support at minimum:

* AAC
* AC3
* copy

Keep it simple.

Prefer avoiding unnecessary transcoding where Plex compatibility is acceptable.

---

# Progress reporting

Use ffmpeg machine-readable progress if practical.

Prefer:

```text
-progress pipe:1
```

Parse structured progress fields rather than scraping the normal human-readable console output.

Use ffprobe duration to calculate percentage.

Display:

* percentage
* elapsed encoding time
* current speed if available
* estimated remaining time if it can be calculated reasonably

Do not create an elaborate statistics subsystem.

---

# Process execution

Use Node's built-in:

```ts
child_process.spawn
```

for ffmpeg and ffprobe.

Capture:

* stdout
* stderr
* exit code

Support cancellation of the current ffmpeg process.

Track child processes explicitly.

Do not install a process-management library.

---

# File and folder selection

Use Electron's built-in native dialogs.

Use:

```ts
dialog.showOpenDialog()
```

for:

* selecting files
* selecting folders
* selecting output directory

Do not install:

* React file picker libraries
* folder picker libraries
* file dialog wrappers

Use Electron's native functionality.

---

# Recursive folder scanning

Use Node built-in filesystem APIs.

Use:

```text
node:fs/promises
node:path
```

Do not install a filesystem traversal package.

Recursively discover `.mkv` files.

Handle nested folders.

Preserve the relative directory structure by default.

Example:

```text
Source:

Anime/
  Cowboy Bebop/
    Disc 1/
      Episode 01.mkv

Output:

Converted/
  Cowboy Bebop/
    Disc 1/
      Episode 01.mkv
```

Make this behavior explicit and unit-testable where possible.

---

# Output naming

For the first version:

* preserve original filename
* output MKV
* do not overwrite source files
* do not overwrite existing destination files silently

If destination exists, mark the item as a conflict.

Do not implement complicated Plex renaming logic yet.

That may come later.

---

# Settings

Persist simple application settings such as:

* last output directory
* preferred audio language
* preferred subtitle language
* last selected preset
* preserve directory structure
* configured ffmpeg path
* configured ffprobe path

Keep persistence simple.

Use a small JSON settings file stored in Electron's normal user-data directory.

Do not add:

* SQLite
* IndexedDB abstraction libraries
* settings libraries

Use:

```ts
app.getPath("userData")
```

and Node filesystem APIs.

---

# ffmpeg / ffprobe discovery

On startup:

1. Check configured paths.
2. Check whether ffmpeg and ffprobe are available in PATH.
3. Validate candidates with:

```text
ffmpeg -version
ffprobe -version
```

4. If not found, show configuration UI allowing the user to browse to the executables.
5. Save valid locations in settings.

Do not automatically download ffmpeg in the first version.

Do not bundle ffmpeg binaries initially.

Keep executable discovery code simple and explicit.

---

# Error handling

Errors should be visible and actionable.

Handle cases such as:

* ffmpeg not found
* ffprobe not found
* ffprobe failure
* malformed or unsupported media file
* inaccessible path
* output already exists
* ffmpeg exits unexpectedly
* permission failure
* process cancellation

Show:

* concise user-facing error
* detailed error/log output where useful

Do not swallow errors.

---

# Logging

Add a small expandable log panel.

Include useful diagnostic information such as:

* ffprobe executable and arguments
* ffmpeg executable and arguments
* ffmpeg stderr
* ffprobe stderr
* exit codes
* application-level errors

Keep logging simple.

Do not add a logging framework unless there is a demonstrated need.

A straightforward in-memory log list plus console logging is fine initially.

---

# Recommended directory structure

Keep it approximately like:

```text
src/
  components/
  media/
    types.ts
    ffprobe.ts
    trackSelection.ts
    ffmpegCommand.ts
    presets.ts
    progress.ts
    outputPaths.ts
  state/
  settings/
  ipc/
  App.tsx

electron/
  main.ts
  preload.ts
  ipc/
    files.ts
    media.ts
    encoding.ts
    settings.ts
```

Adjust if there is a simpler organization.

Do not create dozens of tiny folders unnecessarily.

---

# Renderer / main-process boundary

Keep policy separate from mechanism.

## Policy

Examples:

```text
Which Japanese audio track should be selected?
Which English subtitle track should be selected?
What should the output path be?
Which ffmpeg arguments should be generated?
How should ffmpeg progress be interpreted?
```

These should be pure TypeScript when practical.

## Mechanism

Examples:

```text
Open folder picker.
Read directory.
Run ffprobe.
Spawn ffmpeg.
Kill ffmpeg.
Read/write settings file.
```

These belong in the Electron main process.

Avoid coupling core media logic to Electron.

This should make most important application behavior testable without launching Electron.

---

# Dependency policy

Minimize third-party dependencies aggressively.

Before adding any package, ask:

> Can this be implemented clearly using TypeScript, React, Electron, Node built-ins, or a small amount of obvious code?

If yes, implement it directly.

Do not add libraries merely to save a few lines.

## Acceptable dependencies

Examples:

* Electron
* React
* TypeScript
* Vite
* Vitest
* minimal Electron/Vite integration tooling if needed
* ffmpeg
* ffprobe

## Avoid dependencies for

Do not install libraries for:

* folder picking
* file picking
* filesystem traversal
* path handling
* command execution
* basic settings persistence
* UUID generation unless actually necessary
* duration formatting
* queue management
* basic validation
* state machines
* progress calculation
* command-line argument construction
* basic event handling
* collections utilities
* deep cloning
* string utilities

Use built-in APIs.

Do not add Lodash.

Do not add generic utility libraries.

---

# UI dependency policy

Keep UI dependencies small.

React is enough for most controls.

Prefer standard HTML elements where reasonable:

```text
button
select
input
table
progress
dialog
```

Use CSS to make them look polished.

Do not pull in a large component framework unless it provides clear value.

Avoid:

* Material UI
* Ant Design
* large desktop UI frameworks
* large icon libraries when a few inline SVG icons would suffice

If a small local component abstraction helps consistency, create it locally.

For example:

```text
Button
Select
ProgressBar
Modal
ToolbarButton
```

Keep the implementations understandable.

---

# State management

Do not add Redux.

Start with:

* React state
* hooks
* context where appropriate

If state becomes genuinely awkward, a lightweight store may be considered later.

Do not add one preemptively.

Keep queue state explicit.

---

# Source control

Use Git from the beginning.

Initialize the repository before substantive implementation.

Create a sensible `.gitignore`.

Ignore:

* `node_modules`
* Electron/Vite build output
* generated bundles
* temporary files
* IDE-specific files
* media files
* converted outputs
* machine-specific settings
* local ffmpeg binaries if copied into the workspace

Do not commit generated video files.

---

# Git workflow

Make small, coherent commits at meaningful milestones.

Examples:

```text
initial electron react project
add media models and ffprobe parsing
add anime track selection heuristics
add ffmpeg command generation
add recursive folder import
add encoding queue and progress
```

Do not commit after every tiny edit.

Before committing a meaningful feature:

* run tests
* run type checking
* build the project
* ensure the app still launches when practical

Do not commit known broken states unless explicitly necessary.

---

# Testing philosophy

Regression protection is important.

Unit-test deterministic application behavior.

The core logic should be easy to test without Electron.

Prioritize tests for:

* ffprobe normalization
* audio track selection
* subtitle track selection
* commentary filtering
* signs/songs heuristics
* forced subtitle behavior
* missing metadata
* malformed metadata
* preset selection
* ffmpeg argument generation
* stream mapping
* output path generation
* preserved relative folder structure
* path edge cases
* output conflict detection
* ffmpeg progress parsing

Favor pure functions.

The core flow should resemble:

```text
raw ffprobe JSON
        |
        v
normalizeMediaFile()
        |
        v
MediaFile
        |
        + preferences
        v
selectTracks()
        |
        v
TrackSelection
        |
        + preset
        v
buildFfmpegArgs()
        |
        v
string[]
```

These layers should not depend on React or Electron.

---

# Test framework

Use Vitest.

Keep the test setup minimal.

Do not add:

* Jest
* Mocha
* Sinon
* generic mocking frameworks
* React Testing Library unless UI testing later proves worthwhile
* snapshot testing frameworks

Core tests should usually just invoke functions.

Prefer:

```ts
expect(selectBestSubtitle(file)).toEqual(expectedTrack)
```

or:

```ts
expect(buildFfmpegArgs(request)).toEqual([
  ...
])
```

Use simple data-driven tests where useful.

---

# Test fixtures

Create checked-in sanitized ffprobe JSON fixtures.

Do not commit real media files.

Include representative cases such as:

```text
japanese_audio_english_full_subs.json
japanese_and_english_dub.json
full_and_forced_english_subs.json
signs_and_songs_plus_dialogue.json
commentary_audio.json
missing_language_metadata.json
multiple_japanese_tracks.json
surround_and_stereo_tracks.json
weird_titles.json
```

Use realistic ffprobe-shaped data.

When a real-world file exposes a bug:

1. sanitize its ffprobe JSON
2. add or update a fixture
3. add a regression test
4. confirm test failure
5. fix the bug
6. confirm test passes

Over time, the fixture corpus should represent real anime media edge cases.

---

# Test-driven bug fixing

For bugs in deterministic logic:

1. reproduce bug
2. create a failing regression test
3. verify it fails for the expected reason
4. implement fix
5. verify test passes
6. run full test suite
7. commit test and fix together

Do not force this process for trivial UI layout bugs where a unit test would add no value.

---

# Interfaces and abstractions

Do not create interfaces everywhere by default.

Abstract actual external boundaries where it helps testability.

For example, an abstraction around process execution may be reasonable:

```ts
interface ProcessRunner {
  run(
    executable: string,
    args: string[]
  ): Promise<ProcessResult>;
}
```

But do not create generic repository/service/provider layers.

Do not use dependency injection frameworks.

Prefer concrete code unless an abstraction clearly improves testing or separation.

---

# Build health

Maintain simple commands such as:

```bash
npm test
npm run typecheck
npm run build
npm run dev
```

Add an Electron development command as appropriate.

A feature is not considered complete until:

* tests pass
* TypeScript compiles cleanly
* renderer builds
* Electron main process builds
* app launches
* core workflow still works

Do not suppress type errors to make builds pass.

Avoid blanket:

```ts
any
```

when a reasonable type can be expressed.

---

# Implementation workflow

For each meaningful feature:

1. Define the behavior.
2. Update data types if needed.
3. Implement or extend pure logic.
4. Add unit tests for important behavior.
5. Run tests.
6. Integrate with Electron mechanism layer.
7. Integrate with React UI.
8. Run full test/type/build checks.
9. Commit coherent change.

Favor vertical slices.

Do not build large unused infrastructure before connecting functionality end-to-end.

---

# First milestone

Build a real, runnable vertical slice.

It must support:

1. Launch Electron app.
2. Locate/configure ffmpeg and ffprobe.
3. Add individual MKV files.
4. Add a directory.
5. Recursively find MKVs.
6. Probe files using ffprobe.
7. Normalize ffprobe data.
8. Display media tracks.
9. Automatically select Japanese audio.
10. Automatically select English subtitles.
11. Show the selection reason.
12. Allow manual track overrides.
13. Choose:

* H.264
* HEVC
* Remux

14. Choose output directory.
15. Generate ffmpeg arguments.
16. Encode one or more queued files sequentially.
17. Display progress.
18. Cancel current encode.
19. Report success/failure.
20. Preserve relative folder structure.

Do not stop at scaffolding.

Continue until this workflow is actually wired together.

---

# Things not to build yet

Do not add:

* CI/CD
* Docker
* monorepo tooling
* Nx
* Turborepo
* Redux
* dependency injection
* Storybook
* telemetry
* analytics
* auto-update infrastructure
* user accounts
* cloud sync
* databases
* plug-in architecture
* complicated theme systems
* localization infrastructure
* visual regression testing
* E2E testing
* automatic ffmpeg downloader
* Plex API integration
* episode renaming
* metadata lookup
* scraping
* transcoding farms
* parallel encoding

These can be considered later if actual needs emerge.

---

# Documentation

Maintain a concise README.

Include:

* prerequisites
* install instructions
* development commands
* test commands
* build commands
* ffmpeg/ffprobe expectations
* project architecture
* directory structure
* how settings are stored

Do not generate enormous documentation.

Prefer clear code over long explanatory comments.

Use comments when the reason for something is non-obvious.

---

# Code quality preferences

I prefer:

* explicit code
* strong TypeScript typing
* small functions
* obvious control flow
* descriptive names
* low dependency count
* straightforward data structures
* minimal magic
* minimal boilerplate

Avoid:

* generic frameworks inside the application
* unnecessary inheritance
* excessive interfaces
* clever metaprogramming
* reflection-like patterns
* complicated event buses
* large abstraction layers

When choosing between:

```text
clever reusable abstraction
```

and:

```text
40 lines of obvious code
```

prefer the obvious code.

---

# Important design principle

Treat dependency count and architecture complexity as costs.

This is a small desktop utility for an experienced developer.

Optimize for being able to open the repository six months from now and immediately understand how it works.

Keep the interesting media behavior in plain TypeScript.

Keep Electron as a thin native shell.

Keep React focused on presentation and interaction.

Keep ffmpeg and ffprobe behind explicit process-launching code.

Do not solve hypothetical future scaling problems.

---

# How I want you to work

Start by creating the Electron + React + TypeScript + Vite project and Git repository.

Then implement the vertical slice end-to-end.

Do not stop after creating a skeleton.

When you need operating-system functionality, prefer this order:

1. Electron built-in API
2. Node built-in API
3. small amount of local TypeScript
4. only then consider adding a third-party dependency

Before installing any dependency, explicitly consider whether it is actually needed.

When implementation choices are ambiguous, favor:

* fewer dependencies
* less indirection
* more testable pure functions
* easier debugging
* faster local iteration

At the end, provide:

1. Exact setup/install commands.
2. Exact development command.
3. Exact test command.
4. Exact production build command.
5. Important files and what each contains.
6. Current dependency list and why each dependency is necessary.
7. Any unfinished functionality.
8. Representative ffmpeg commands generated by the application.
9. A summary of the unit-test coverage.
10. The current Git commit history.

Assume Windows is my primary development environment.
