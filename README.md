# Geeky Punks converter

Super simple converter for Erica synth samplers and drum machines.

## What it does
- Import audio files in almost any format (via `ffmpeg`).
- Convert to Erica target format: `mono`, `48kHz`, `16-bit WAV`.
- Optional `Normalize` feature.
- Keeps output in the source folder in desktop mode.
- If output file already exists:
  - `Overwrite current`
  - `Overwrite all`
  - `Skip` (creates numbered filename like `_1`, `_2`, ...)

## Desktop app (macOS + Windows)
This project uses **Neutralino** for a lightweight desktop app footprint.

### Requirements
- Node.js 18+
- `ffmpeg` installed and available in `PATH`

### Run desktop app
```bash
npm install
npm run desktop:dev
```

### Build desktop binaries
```bash
npm run desktop:build
```

Or by target:
```bash
npm run desktop:mac
npm run desktop:win
```

Build output is generated in `/dist`.

## Web version
Web UI is in `/web` and reuses the same app logic.

### Run web locally
```bash
npm run web
```

Then open [http://localhost:8080/web/](http://localhost:8080/web/).

## GitHub Hosting
- Web app entry: `web/index.html`
- Platform downloads are in `web/downloads/`:
  - macOS Universal / ARM / Intel
  - Windows x64
  - Linux x64 / ARM64 / ARMHF
- `web/index.html` already includes direct download links for all builds.

### Notes for web mode
- Conversion runs in-browser using `ffmpeg.wasm`.
- If your browser supports File System Access API, choose an output folder.
- Otherwise files download to your browser's default download location.

## Erica target format
- Channels: `1` (mono)
- Sample rate: `48000 Hz`
- Sample format: `16-bit` (`s16`)
- Container: `WAV`
