const TARGET_SAMPLE_RATE = "48000";
const TARGET_CHANNELS = "1";
const TARGET_SAMPLE_FORMAT = "s16";
const TARGET_EXTENSION = "wav";
const NORMALIZE_FILTER = "loudnorm=I=-14:LRA=11:TP=-1.0";
const CANCELLED_ERROR_MESSAGE = "Conversion cancelled by user.";
const FFMPEG_LOCAL_ASSETS = {
  ffmpegModule: new URL("../vendor/ffmpeg/index.js", import.meta.url).href,
  ffmpegWorker: new URL("../vendor/ffmpeg/worker.js", import.meta.url).href,
  utilModule: new URL("../vendor/ffmpeg-util/index.js", import.meta.url).href,
  coreJs: new URL("../vendor/ffmpeg-core/ffmpeg-core.js", import.meta.url).href,
  coreWasm: new URL("../vendor/ffmpeg-core/ffmpeg-core.wasm", import.meta.url).href,
};

const state = {
  desktopMode: typeof window.Neutralino !== "undefined" && typeof window.NL_OS === "string",
  files: [],
  converting: false,
  overwriteAll: false,
  ffmpegExecutable: null,
  outputDirHandle: null,
  ffmpegWeb: null,
  webFetchFile: null,
  conflictResolver: null,
};

const elements = {
  pickFilesBtn: document.getElementById("pickFilesBtn"),
  clearFilesBtn: document.getElementById("clearFilesBtn"),
  normalizeToggle: document.getElementById("normalizeToggle"),
  pickWebOutputBtn: document.getElementById("pickWebOutputBtn"),
  outputHint: document.getElementById("outputHint"),
  fileCount: document.getElementById("fileCount"),
  progressWrap: document.getElementById("progressWrap"),
  progressLine: document.getElementById("progressLine"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  statusText: document.getElementById("statusText"),
  startBtn: document.getElementById("startBtn"),
  log: document.getElementById("log"),
  webFileInput: document.getElementById("webFileInput"),
  conflictModal: document.getElementById("conflictModal"),
  conflictText: document.getElementById("conflictText"),
  conflictButtons: Array.from(document.querySelectorAll("[data-decision]")),
};

boot();

function boot() {
  bindUI();
  updateContextHints();
  renderFileList();

  if (state.desktopMode) {
    Neutralino.init();
    if (window.NL_OS === "Darwin") {
      configureDesktopMenu();
    }
    setStatus("Ready. Import audio to convert.", "info");
    logLine("Desktop mode active. Output will stay in each source folder.");
    return;
  }

  setStatus("Ready. Import audio to convert.", "info");
  logLine("Web mode active. Choose an output folder to keep files together.");
}

function configureDesktopMenu() {
  Neutralino.window.setMainMenu([
    {
      text: "App",
      menuItems: [
        {
          text: "Quit Geeky Punks converter",
          action: "quit",
          shortcut: "Cmd+Q",
        },
      ],
    },
  ]);
}

function bindUI() {
  elements.pickFilesBtn.addEventListener("click", onPickFilesClicked);
  elements.clearFilesBtn.addEventListener("click", () => {
    if (state.converting) {
      return;
    }
    state.files = [];
    renderFileList();
    logLine("Selection cleared.");
  });

  elements.startBtn.addEventListener("click", convertAllFiles);

  elements.webFileInput.addEventListener("change", () => {
    if (!elements.webFileInput.files) {
      return;
    }
    addWebFiles(Array.from(elements.webFileInput.files));
    elements.webFileInput.value = "";
  });

  elements.pickWebOutputBtn.addEventListener("click", pickWebOutputFolder);

  elements.conflictButtons.forEach((button) => {
    button.addEventListener("click", () => {
      resolveConflictChoice(button.dataset.decision || "skip");
    });
  });
}

function updateContextHints() {
  if (state.desktopMode) {
    elements.pickWebOutputBtn.hidden = true;
    elements.outputHint.textContent = "Destination: same folder as each source file.";
    return;
  }

  const canPickFolder = typeof window.showDirectoryPicker === "function";
  elements.pickWebOutputBtn.hidden = !canPickFolder;
  if (canPickFolder) {
    elements.outputHint.textContent = "Destination: browser downloads (or pick output folder).";
  } else {
    elements.outputHint.textContent = "Destination: browser downloads (folder access is not supported in this browser).";
  }
}

function renderFileList() {
  const count = state.files.length;
  elements.fileCount.textContent = `${count} file${count === 1 ? "" : "s"} selected`;
  elements.startBtn.disabled = state.converting || count === 0;
  elements.startBtn.textContent = state.converting ? "Processing..." : "Convert Files";
  elements.pickFilesBtn.disabled = state.converting;
  elements.clearFilesBtn.disabled = state.converting;
  elements.normalizeToggle.disabled = state.converting;
  elements.pickWebOutputBtn.disabled = state.converting;
}

function logLine(message, kind = "info") {
  setStatus(message, kind);

  if (!elements.log) {
    return;
  }

  const line = document.createElement("div");
  line.className = `log-line ${kind === "error" ? "log-error" : ""} ${kind === "success" ? "log-success" : ""}`;
  const stamp = new Date().toLocaleTimeString();
  line.textContent = `[${stamp}] ${message}`;
  elements.log.append(line);
  elements.log.scrollTop = elements.log.scrollHeight;
}

function setStatus(message, kind = "info") {
  if (!elements.statusText) {
    return;
  }
  elements.statusText.textContent = message;
  elements.statusText.className = `status-text ${kind === "error" ? "status-error" : ""} ${kind === "success" ? "status-success" : ""}`.trim();
}

function setProgress(visible, percent, message) {
  if (!elements.progressWrap || !elements.progressBar || !elements.progressLine) {
    return;
  }

  elements.progressWrap.hidden = !visible;
  if (!visible) {
    elements.progressBar.style.width = "0%";
    elements.progressLine.setAttribute("aria-valuenow", "0");
    return;
  }

  const bounded = Math.max(0, Math.min(100, Math.round(percent)));
  elements.progressBar.style.width = `${bounded}%`;
  elements.progressLine.setAttribute("aria-valuenow", String(bounded));
  if (elements.progressText && message) {
    elements.progressText.textContent = message;
  }
}

async function onPickFilesClicked() {
  if (state.converting) {
    return;
  }

  if (state.desktopMode) {
    await addDesktopFiles();
    return;
  }

  await addWebFilesViaPicker();
}

async function addWebFilesViaPicker() {
  if (typeof window.showOpenFilePicker === "function") {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "Audio files",
            accept: {
              "audio/*": [".wav", ".wave", ".aif", ".aiff", ".flac", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wma", ".alac", ".caf"],
            },
          },
        ],
      });
      const files = await Promise.all(handles.map((handle) => handle.getFile()));
      addWebFiles(files);
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      // Fallback to hidden input for browsers with partial API behavior.
    }
  }

  triggerHiddenWebInput();
}

function triggerHiddenWebInput() {
  elements.webFileInput.click();
}

async function addDesktopFiles() {
  try {
    const paths = await Neutralino.os.showOpenDialog("Import audio files", {
      multiSelections: true,
      filters: [
        {
          name: "Audio",
          extensions: [
            "wav",
            "wave",
            "aif",
            "aiff",
            "flac",
            "mp3",
            "m4a",
            "aac",
            "ogg",
            "oga",
            "opus",
            "wma",
            "alac",
            "caf",
          ],
        },
        { name: "All files", extensions: ["*"] },
      ],
    });

    if (!paths || paths.length === 0) {
      return;
    }

    let added = 0;
    for (const desktopPath of paths) {
      if (state.files.some((file) => file.desktopPath === desktopPath)) {
        continue;
      }

      state.files.push({
        id: `desktop:${desktopPath}`,
        name: getFilenameFromPath(desktopPath),
        desktopPath,
      });
      added += 1;
    }

    renderFileList();
    logLine(`${added} file${added === 1 ? "" : "s"} added.`);
  } catch (error) {
    logLine(`Could not open files: ${errorToText(error)}`, "error");
  }
}

function addWebFiles(files) {
  let added = 0;

  for (const webFile of files) {
    const id = `web:${webFile.name}:${webFile.size}:${webFile.lastModified}`;
    if (state.files.some((file) => file.id === id)) {
      continue;
    }

    state.files.push({
      id,
      name: webFile.name,
      webFile,
    });

    added += 1;
  }

  renderFileList();
  logLine(`${added} file${added === 1 ? "" : "s"} added.`);
}

async function pickWebOutputFolder() {
  if (state.desktopMode || typeof window.showDirectoryPicker !== "function") {
    return;
  }

  try {
    state.outputDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    elements.outputHint.textContent = `Destination: ${state.outputDirHandle.name}`;
    logLine(`Output folder selected: ${state.outputDirHandle.name}`);
  } catch (error) {
    if (error && error.name === "AbortError") {
      return;
    }
    logLine(`Could not select output folder: ${errorToText(error)}`, "error");
  }
}

async function convertAllFiles() {
  if (state.converting || state.files.length === 0) {
    return;
  }

  state.converting = true;
  state.overwriteAll = false;
  setProgress(true, 0, `Processing 0/${state.files.length}`);
  setStatus("Starting conversion...", "info");
  renderFileList();

  try {
    if (state.desktopMode) {
      await ensureDesktopFfmpeg();
      await convertDesktopFiles();
    } else {
      await ensureWebFfmpeg();
      await convertWebFiles();
    }

    logLine("All conversions finished.", "success");
  } catch (error) {
    const message = errorToText(error);
    if (message === CANCELLED_ERROR_MESSAGE) {
      logLine("Conversion cancelled.");
    } else {
      logLine(`Conversion stopped: ${message}`, "error");
    }
  } finally {
    state.converting = false;
    state.overwriteAll = false;
    setProgress(false, 0, "");
    renderFileList();
  }
}

async function ensureDesktopFfmpeg() {
  if (state.ffmpegExecutable) {
    return;
  }

  const candidates = [
    "ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ];

  for (const candidate of candidates) {
    const probe = await Neutralino.os.execCommand(`${quoteShellArg(candidate)} -version`);
    if (probe.exitCode === 0) {
      state.ffmpegExecutable = candidate;
      return;
    }
  }

  throw new Error("ffmpeg not found. Install ffmpeg in PATH, /opt/homebrew/bin, or /usr/local/bin.");
}

async function convertDesktopFiles() {
  const normalize = elements.normalizeToggle.checked;

  for (let i = 0; i < state.files.length; i += 1) {
    const item = state.files[i];
    const label = `[${i + 1}/${state.files.length}] ${item.name}`;
    setProgress(true, (i / state.files.length) * 100, `Processing ${i + 1}/${state.files.length}`);
    logLine(`Converting ${label}`);

    const output = await chooseDesktopOutputPath(item.desktopPath);
    const mustUseTemp = comparePaths(output, item.desktopPath);
    const tempOutput = mustUseTemp ? await buildDesktopTempPath(item.desktopPath) : output;

    await runDesktopConversion(item.desktopPath, tempOutput, normalize);

    if (mustUseTemp) {
      await Neutralino.filesystem.remove(output);
      await Neutralino.filesystem.move(tempOutput, output);
    }

    setProgress(true, ((i + 1) / state.files.length) * 100, `Processing ${i + 1}/${state.files.length}`);
    logLine(`Saved ${output}`, "success");
  }
}

async function chooseDesktopOutputPath(inputPath) {
  let outputPath = await buildDesktopOutputPath(inputPath, 0);
  const exists = await desktopPathExists(outputPath);

  if (!exists) {
    return outputPath;
  }

  const fileName = getFilenameFromPath(outputPath);
  let decision = state.overwriteAll ? "overwrite-current" : await askConflictChoice(fileName);

  if (decision === "overwrite-all") {
    state.overwriteAll = true;
    decision = "overwrite-current";
  }

  if (decision === "cancel") {
    throw new Error(CANCELLED_ERROR_MESSAGE);
  }

  if (decision === "skip") {
    outputPath = await nextDesktopOutputPath(inputPath);
  }

  return outputPath;
}

async function buildDesktopOutputPath(inputPath, suffix) {
  const parts = await Neutralino.filesystem.getPathParts(inputPath);
  const stem = parts.stem || stripFileExtension(parts.filename);
  const outputName = suffix > 0 ? `${stem}_${suffix}.${TARGET_EXTENSION}` : `${stem}.${TARGET_EXTENSION}`;
  return Neutralino.filesystem.getJoinedPath(parts.parentPath, outputName);
}

async function nextDesktopOutputPath(inputPath) {
  let suffix = 1;

  while (true) {
    const candidate = await buildDesktopOutputPath(inputPath, suffix);
    if (!(await desktopPathExists(candidate))) {
      return candidate;
    }
    suffix += 1;
  }
}

async function buildDesktopTempPath(inputPath) {
  const parts = await Neutralino.filesystem.getPathParts(inputPath);
  const stem = parts.stem || stripFileExtension(parts.filename);
  const stamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const tempName = `${stem}.__gp_tmp_${stamp}_${random}.${TARGET_EXTENSION}`;
  return Neutralino.filesystem.getJoinedPath(parts.parentPath, tempName);
}

async function desktopPathExists(path) {
  try {
    await Neutralino.filesystem.getStats(path);
    return true;
  } catch {
    return false;
  }
}

async function runDesktopConversion(inputPath, outputPath, normalize) {
  const args = [
    state.ffmpegExecutable || "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-ac",
    TARGET_CHANNELS,
    "-ar",
    TARGET_SAMPLE_RATE,
    "-sample_fmt",
    TARGET_SAMPLE_FORMAT,
  ];

  if (normalize) {
    args.push("-af", NORMALIZE_FILTER);
  }

  args.push(outputPath);

  const command = args.map((arg) => quoteShellArg(String(arg))).join(" ");

  const result = await Neutralino.os.execCommand(command);
  if (result.exitCode !== 0) {
    throw new Error(result.stdErr || result.stdOut || "ffmpeg conversion failed");
  }
}

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) {
    return value;
  }

  if (window.NL_OS === "Windows") {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function comparePaths(pathA, pathB) {
  if (window.NL_OS === "Windows") {
    return pathA.toLowerCase() === pathB.toLowerCase();
  }
  return pathA === pathB;
}

async function ensureWebFfmpeg() {
  if (state.ffmpegWeb) {
    return;
  }

  logLine("Loading web ffmpeg engine. First run can take a few seconds.");

  const ffmpegModule = await importFromCandidates(
    [
      FFMPEG_LOCAL_ASSETS.ffmpegModule,
      "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js",
      "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js",
    ],
    "ffmpeg"
  );
  const utilModule = await importFromCandidates(
    [
      FFMPEG_LOCAL_ASSETS.utilModule,
      "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js",
      "https://unpkg.com/@ffmpeg/util@0.12.2/dist/esm/index.js",
    ],
    "ffmpeg util"
  );
  const { FFmpeg } = ffmpegModule;
  const { fetchFile, toBlobURL } = utilModule;

  const loadErrors = [];
  let loadedFfmpeg = null;
  loadedFfmpeg = await loadWebEngineAttempt(
    FFmpeg,
    "local bundled ffmpeg assets",
    {
      classWorkerURL: FFMPEG_LOCAL_ASSETS.ffmpegWorker,
      coreURL: FFMPEG_LOCAL_ASSETS.coreJs,
      wasmURL: FFMPEG_LOCAL_ASSETS.coreWasm,
    },
    loadErrors
  );

  if (!loadedFfmpeg) {
    const cdnMirrors = [
      {
        label: "jsDelivr CDN",
        worker: "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/worker.js",
        core: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.js",
        wasm: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.wasm",
      },
      {
        label: "unpkg CDN",
        worker: "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/worker.js",
        core: "https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.js",
        wasm: "https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core.wasm",
      },
    ];

    for (const mirror of cdnMirrors) {
      let blobConfig = null;
      try {
        blobConfig = {
          classWorkerURL: await toBlobURL(mirror.worker, "text/javascript"),
          coreURL: await toBlobURL(mirror.core, "text/javascript"),
          wasmURL: await toBlobURL(mirror.wasm, "application/wasm"),
        };
      } catch (error) {
        loadErrors.push(`${mirror.label}: ${errorToText(error)}`);
        continue;
      }

      loadedFfmpeg = await loadWebEngineAttempt(FFmpeg, mirror.label, blobConfig, loadErrors);
      if (loadedFfmpeg) {
        break;
      }
    }
  }

  if (!loadedFfmpeg) {
    throw new Error(`Failed to load ffmpeg engine. ${loadErrors.join(" | ")}`);
  }

  state.ffmpegWeb = loadedFfmpeg;
  state.webFetchFile = fetchFile;
  logLine("Web ffmpeg engine loaded.", "success");
}

async function loadWebEngineAttempt(FFmpeg, label, config, loadErrors) {
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => {
    if (message && message.toLowerCase().includes("error")) {
      logLine(message, "error");
    }
  });

  try {
    await ffmpeg.load(config);
    return ffmpeg;
  } catch (error) {
    loadErrors.push(`${label}: ${errorToText(error)}`);
    try {
      ffmpeg.terminate();
    } catch {
      // Ignore termination errors from partially initialized workers.
    }
    return null;
  }
}

async function importFromCandidates(urls, label) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await import(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Failed to load ${label}: ${errorToText(lastError)}`);
}

async function convertWebFiles() {
  const normalize = elements.normalizeToggle.checked;
  const namesReserved = new Set();

  for (let i = 0; i < state.files.length; i += 1) {
    const item = state.files[i];
    const virtualInput = `input_${i}_${item.name}`;
    const virtualOutput = `output_${i}.${TARGET_EXTENSION}`;

    setProgress(true, (i / state.files.length) * 100, `Processing ${i + 1}/${state.files.length}`);
    logLine(`Converting [${i + 1}/${state.files.length}] ${item.name}`);

    await state.ffmpegWeb.writeFile(virtualInput, await state.webFetchFile(item.webFile));

    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      virtualInput,
      "-ac",
      TARGET_CHANNELS,
      "-ar",
      TARGET_SAMPLE_RATE,
      "-sample_fmt",
      TARGET_SAMPLE_FORMAT,
    ];

    if (normalize) {
      args.push("-af", NORMALIZE_FILTER);
    }

    args.push(virtualOutput);

    await state.ffmpegWeb.exec(args);
    const bytes = await state.ffmpegWeb.readFile(virtualOutput);
    const blob = new Blob([bytes], { type: "audio/wav" });

    const outName = await chooseWebOutputName(item.name, namesReserved);
    namesReserved.add(outName);

    if (state.outputDirHandle) {
      await writeWebOutputToFolder(blob, outName);
      logLine(`Saved ${outName}`, "success");
    } else {
      triggerBrowserDownload(blob, outName);
      logLine(`Downloaded ${outName}`, "success");
    }

    await Promise.allSettled([
      state.ffmpegWeb.deleteFile(virtualInput),
      state.ffmpegWeb.deleteFile(virtualOutput),
    ]);
    setProgress(true, ((i + 1) / state.files.length) * 100, `Processing ${i + 1}/${state.files.length}`);
  }
}

async function chooseWebOutputName(sourceName, namesReserved) {
  const baseStem = stripFileExtension(sourceName);
  let candidate = `${baseStem}.${TARGET_EXTENSION}`;

  if (!state.outputDirHandle) {
    if (!namesReserved.has(candidate)) {
      return candidate;
    }

    let n = 1;
    while (true) {
      candidate = `${baseStem}_${n}.${TARGET_EXTENSION}`;
      if (!namesReserved.has(candidate)) {
        return candidate;
      }
      n += 1;
    }
  }

  const exists = await webPathExists(state.outputDirHandle, candidate);
  if (!exists) {
    return candidate;
  }

  let decision = state.overwriteAll ? "overwrite-current" : await askConflictChoice(candidate);

  if (decision === "overwrite-all") {
    state.overwriteAll = true;
    decision = "overwrite-current";
  }

  if (decision === "cancel") {
    throw new Error(CANCELLED_ERROR_MESSAGE);
  }

  if (decision === "overwrite-current") {
    return candidate;
  }

  let n = 1;
  while (true) {
    candidate = `${baseStem}_${n}.${TARGET_EXTENSION}`;
    if (!(await webPathExists(state.outputDirHandle, candidate))) {
      return candidate;
    }
    n += 1;
  }
}

async function webPathExists(folderHandle, fileName) {
  try {
    await folderHandle.getFileHandle(fileName, { create: false });
    return true;
  } catch {
    return false;
  }
}

async function writeWebOutputToFolder(blob, fileName) {
  const fileHandle = await state.outputDirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function triggerBrowserDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function askConflictChoice(fileName) {
  elements.conflictText.textContent = `${fileName} already exists. Overwrite, skip, or cancel conversion?`;
  elements.conflictModal.hidden = false;

  return new Promise((resolve) => {
    state.conflictResolver = resolve;
  });
}

function resolveConflictChoice(decision) {
  elements.conflictModal.hidden = true;
  if (!state.conflictResolver) {
    return;
  }

  const resolver = state.conflictResolver;
  state.conflictResolver = null;
  resolver(decision);
}

function getFilenameFromPath(path) {
  return path.split(/[\\/]/).pop() || path;
}

function stripFileExtension(name) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return name;
  }
  return name.slice(0, dot);
}

function errorToText(error) {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error.message) {
    return String(error.message);
  }

  return String(error);
}
