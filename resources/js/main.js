import { buildKitMakerPlan, KIT_MAKER_LIMIT_WARNING } from "./kit-maker.mjs";

const TARGET_SAMPLE_RATE = "48000";
const TARGET_CHANNELS = "1";
const TARGET_SAMPLE_FORMAT = "s16";
const TARGET_EXTENSION = "wav";
const NORMALIZE_FILTER = "loudnorm=I=-14:LRA=11:TP=-1.0";
const CANCELLED_ERROR_MESSAGE = "Conversion cancelled by user.";
const CONVERT_SUCCESS_MESSAGE = "Ready, like it should be.";
const KIT_SUCCESS_MESSAGE = "Ribbit. Export ready. 🐸";
const TOAST_TIMEOUT_MS = 3000;
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
  kitMaking: false,
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
  manualBtn: document.getElementById("manualBtn"),
  manualModal: document.getElementById("manualModal"),
  manualCloseBtn: document.getElementById("manualCloseBtn"),
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
  kitMakerBtn: document.getElementById("kitMakerBtn"),
  kitMakerWarning: document.getElementById("kitMakerWarning"),
  exportList: document.getElementById("exportList"),
  log: document.getElementById("log"),
  webFileInput: document.getElementById("webFileInput"),
  conflictModal: document.getElementById("conflictModal"),
  conflictText: document.getElementById("conflictText"),
  conflictButtons: Array.from(document.querySelectorAll("[data-decision]")),
  recommendedDownloadBtn: document.getElementById("recommendedDownloadBtn"),
  recommendedDownloadHint: document.getElementById("recommendedDownloadHint"),
};

boot();

function boot() {
  document.body.classList.toggle("desktop-app", state.desktopMode);
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

  configureRecommendedDownload();
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
    if (state.converting || state.kitMaking) {
      return;
    }
    state.files = [];
    setKitMakerWarning("");
    renderFileList();
    logLine("Selection cleared.");
  });

  elements.startBtn.addEventListener("click", convertAllFiles);
  elements.kitMakerBtn?.addEventListener("click", runKitMaker);
  elements.manualBtn?.addEventListener("click", openManualModal);
  elements.manualCloseBtn?.addEventListener("click", closeManualModal);
  elements.manualModal?.addEventListener("click", (event) => {
    if (event.target === elements.manualModal) {
      closeManualModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.manualModal && !elements.manualModal.hidden) {
      closeManualModal();
    }
  });

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

function configureRecommendedDownload() {
  if (!elements.recommendedDownloadBtn) {
    return;
  }

  const source = detectBrowserSystem();
  elements.recommendedDownloadBtn.href = source.href;
  elements.recommendedDownloadBtn.textContent = source.label;
  if (elements.recommendedDownloadHint) {
    elements.recommendedDownloadHint.textContent = source.hint;
  }
}

function detectBrowserSystem() {
  const userAgent = (navigator.userAgent || "").toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();
  const probe = `${userAgent} ${platform}`;

  if (probe.includes("win")) {
    return {
      label: "Download for Windows",
      href: "./downloads/Geeky-Punks-converter-windows-x64-v1.0.11.zip",
      hint: "Detected: Windows browser.",
    };
  }

  if (probe.includes("linux")) {
    return {
      label: "Download for Linux",
      href: "./downloads/Geeky-Punks-converter-linux-x64-v1.0.11.zip",
      hint: "Detected: Linux browser.",
    };
  }

  if (probe.includes("mac")) {
    return {
      label: "Download for macOS",
      href: "./downloads/Geeky-Punks-converter-mac-arm64-v1.0.11.dmg",
      hint: "Detected: macOS browser (ARM build by default).",
    };
  }

  return {
    label: "Open All Downloads",
    href: "./downloads/index.html",
    hint: "System not detected. Choose your build from All Downloads.",
  };
}

function renderFileList() {
  const count = state.files.length;
  const busy = state.converting || state.kitMaking;
  if (count <= 10 && !state.kitMaking) {
    setKitMakerWarning("");
  }
  elements.fileCount.textContent = `${count} file${count === 1 ? "" : "s"} selected`;
  elements.startBtn.disabled = busy || count === 0;
  elements.startBtn.textContent = state.converting ? "Processing..." : "Convert Files";
  if (elements.kitMakerBtn) {
    elements.kitMakerBtn.disabled = busy || count === 0;
    elements.kitMakerBtn.textContent = state.kitMaking ? "Kit Maker..." : "Kit Maker";
  }
  elements.pickFilesBtn.disabled = busy;
  elements.clearFilesBtn.disabled = busy;
  elements.normalizeToggle.disabled = busy;
  elements.pickWebOutputBtn.disabled = busy;
}

function setKitMakerWarning(message) {
  if (!elements.kitMakerWarning) {
    return;
  }

  if (!message) {
    elements.kitMakerWarning.hidden = true;
    elements.kitMakerWarning.textContent = "";
    return;
  }

  elements.kitMakerWarning.hidden = false;
  elements.kitMakerWarning.textContent = message;
}

function openManualModal() {
  if (!elements.manualModal) {
    return;
  }
  elements.manualModal.hidden = false;
}

function closeManualModal() {
  if (!elements.manualModal) {
    return;
  }
  elements.manualModal.hidden = true;
}

function appendExportItem(message) {
  if (!elements.exportList || !message) {
    return false;
  }

  const empty = elements.exportList.querySelector("[data-export-empty]");
  if (empty) {
    empty.remove();
  }

  const row = document.createElement("li");
  row.className = "export-item";
  row.textContent = message;
  elements.exportList.prepend(row);

  if (elements.exportList.childElementCount > 80) {
    elements.exportList.lastElementChild?.remove();
  }

  return true;
}

function showToast(message, kind = "success") {
  if (!message) {
    return;
  }

  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-atomic", "true");
    document.body.append(host);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;
  toast.textContent = message;
  toast.tabIndex = 0;
  host.append(toast);

  requestAnimationFrame(() => {
    toast.classList.add("toast-visible");
  });

  let removed = false;
  const removeToast = () => {
    if (removed) {
      return;
    }
    removed = true;
    toast.classList.remove("toast-visible");
    toast.addEventListener(
      "transitionend",
      () => {
        toast.remove();
      },
      { once: true }
    );
  };

  const onToastKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
      event.preventDefault();
      removeToast();
    }
  };

  toast.addEventListener("click", removeToast);
  toast.addEventListener("keydown", onToastKeyDown);

  window.setTimeout(removeToast, TOAST_TIMEOUT_MS);
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
  if (state.converting || state.kitMaking || state.files.length === 0) {
    return;
  }

  state.converting = true;
  state.overwriteAll = false;
  setProgress(true, 0, `Processing 0/${state.files.length}`);
  setStatus("Starting conversion...", "info");
  renderFileList();

  try {
    let exportedCount = 0;
    if (state.desktopMode) {
      await ensureDesktopFfmpeg();
      exportedCount = await convertDesktopFiles();
    } else {
      await ensureWebFfmpeg();
      exportedCount = await convertWebFiles();
    }

    if (exportedCount > 0) {
      logLine(CONVERT_SUCCESS_MESSAGE, "success");
      showToast(CONVERT_SUCCESS_MESSAGE, "success");
    }
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

async function runKitMaker() {
  if (state.converting || state.kitMaking || state.files.length === 0) {
    return;
  }

  const plan = buildKitMakerPlan(state.files);
  if (plan.blocked) {
    if (plan.warning) {
      const warningText = KIT_MAKER_LIMIT_WARNING;
      setKitMakerWarning(warningText);
      setStatus(warningText, "error");
      logLine(warningText, "error");
      showToast(warningText, "error");
    }
    return;
  }

  state.kitMaking = true;
  setKitMakerWarning("");
  setProgress(true, 0, `Kit Maker 0/${plan.entries.length}`);
  setStatus("Building kit...", "info");
  renderFileList();

  try {
    let exportedCount = 0;
    if (state.desktopMode) {
      await ensureDesktopFfmpeg();
      exportedCount = await buildDesktopKit(plan);
    } else {
      await ensureWebFfmpeg();
      exportedCount = await buildWebKit(plan);
    }
    if (exportedCount > 0) {
      logLine(KIT_SUCCESS_MESSAGE, "success");
      showToast(KIT_SUCCESS_MESSAGE, "success");
    }
  } catch (error) {
    logLine(`Kit Maker stopped: ${errorToText(error)}`, "error");
  } finally {
    state.kitMaking = false;
    setProgress(false, 0, "");
    renderFileList();
  }
}

async function buildDesktopKit(plan) {
  const normalize = elements.normalizeToggle.checked;
  const first = plan.entries[0]?.file;
  if (!first || !first.desktopPath) {
    throw new Error("No files available for Kit Maker.");
  }

  const parts = await Neutralino.filesystem.getPathParts(first.desktopPath);
  const kitFolder = await Neutralino.filesystem.getJoinedPath(parts.parentPath, plan.folderName);
  await ensureDesktopDirectory(kitFolder);

  for (let i = 0; i < plan.entries.length; i += 1) {
    const entry = plan.entries[i];
    const outputPath = await Neutralino.filesystem.getJoinedPath(kitFolder, entry.outputName);
    setProgress(true, (i / plan.entries.length) * 100, `Kit Maker ${i + 1}/${plan.entries.length}`);
    logLine(`Kit Maker [${i + 1}/${plan.entries.length}] ${entry.file.name} -> ${entry.outputName}`);
    await runDesktopConversion(entry.file.desktopPath, outputPath, normalize);
    setProgress(true, ((i + 1) / plan.entries.length) * 100, `Kit Maker ${i + 1}/${plan.entries.length}`);
    logLine(`Saved ${outputPath}`, "success");
  }

  const summary = `${plan.folderName} (${plan.entries.length} file${plan.entries.length === 1 ? "" : "s"})`;
  return appendExportItem(summary) ? 1 : 0;
}

async function ensureDesktopDirectory(path) {
  if (await desktopPathExists(path)) {
    return;
  }
  await Neutralino.filesystem.createDirectory(path);
}

async function buildWebKit(plan) {
  const normalize = elements.normalizeToggle.checked;
  const kitFolderHandle = state.outputDirHandle
    ? await state.outputDirHandle.getDirectoryHandle(plan.folderName, { create: true })
    : null;

  for (let i = 0; i < plan.entries.length; i += 1) {
    const entry = plan.entries[i];
    setProgress(true, (i / plan.entries.length) * 100, `Kit Maker ${i + 1}/${plan.entries.length}`);
    logLine(`Kit Maker [${i + 1}/${plan.entries.length}] ${entry.file.name} -> ${entry.outputName}`);

    const blob = await convertWebFileToBlob(
      entry.file.webFile,
      `kit_input_${i}_${entry.file.name}`,
      `kit_output_${i}.${TARGET_EXTENSION}`,
      normalize
    );

    if (kitFolderHandle) {
      await writeWebOutputToFolder(blob, entry.outputName, kitFolderHandle);
      logLine(`Saved ${plan.folderName}/${entry.outputName}`, "success");
    } else {
      const fallbackName = `${plan.folderName}_${entry.outputName}`;
      triggerBrowserDownload(blob, fallbackName);
      logLine(`Downloaded ${fallbackName}`, "success");
    }

    setProgress(true, ((i + 1) / plan.entries.length) * 100, `Kit Maker ${i + 1}/${plan.entries.length}`);
  }

  if (kitFolderHandle) {
    return appendExportItem(`${plan.folderName} (${plan.entries.length} file${plan.entries.length === 1 ? "" : "s"})`) ? 1 : 0;
  }

  return appendExportItem(`${plan.folderName} (${plan.entries.length} downloads)`) ? 1 : 0;
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
  let exportedCount = 0;

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
    if (appendExportItem(output)) {
      exportedCount += 1;
    }
  }

  return exportedCount;
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

function buildConversionArgs(inputPath, outputPath, normalize) {
  const args = ["-i", inputPath, "-ac", TARGET_CHANNELS, "-ar", TARGET_SAMPLE_RATE, "-sample_fmt", TARGET_SAMPLE_FORMAT];
  if (normalize) {
    args.push("-af", NORMALIZE_FILTER);
  }
  args.push(outputPath);
  return args;
}

async function runDesktopConversion(inputPath, outputPath, normalize) {
  const args = [
    state.ffmpegExecutable || "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...buildConversionArgs(inputPath, outputPath, normalize),
  ];

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
  let exportedCount = 0;

  for (let i = 0; i < state.files.length; i += 1) {
    const item = state.files[i];

    setProgress(true, (i / state.files.length) * 100, `Processing ${i + 1}/${state.files.length}`);
    logLine(`Converting [${i + 1}/${state.files.length}] ${item.name}`);
    const blob = await convertWebFileToBlob(item.webFile, `input_${i}_${item.name}`, `output_${i}.${TARGET_EXTENSION}`, normalize);

    const outName = await chooseWebOutputName(item.name, namesReserved);
    namesReserved.add(outName);

    if (state.outputDirHandle) {
      await writeWebOutputToFolder(blob, outName);
      logLine(`Saved ${outName}`, "success");
      if (appendExportItem(outName)) {
        exportedCount += 1;
      }
    } else {
      triggerBrowserDownload(blob, outName);
      logLine(`Downloaded ${outName}`, "success");
      if (appendExportItem(outName)) {
        exportedCount += 1;
      }
    }

    setProgress(true, ((i + 1) / state.files.length) * 100, `Processing ${i + 1}/${state.files.length}`);
  }

  return exportedCount;
}

async function convertWebFileToBlob(webFile, virtualInput, virtualOutput, normalize) {
  await state.ffmpegWeb.writeFile(virtualInput, await state.webFetchFile(webFile));
  const args = ["-hide_banner", "-loglevel", "error", ...buildConversionArgs(virtualInput, virtualOutput, normalize)];
  try {
    await state.ffmpegWeb.exec(args);
    const bytes = await state.ffmpegWeb.readFile(virtualOutput);
    return new Blob([bytes], { type: "audio/wav" });
  } finally {
    await Promise.allSettled([state.ffmpegWeb.deleteFile(virtualInput), state.ffmpegWeb.deleteFile(virtualOutput)]);
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

async function writeWebOutputToFolder(blob, fileName, folderHandle = state.outputDirHandle) {
  if (!folderHandle) {
    throw new Error("No output folder selected.");
  }
  const fileHandle = await folderHandle.getFileHandle(fileName, { create: true });
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
