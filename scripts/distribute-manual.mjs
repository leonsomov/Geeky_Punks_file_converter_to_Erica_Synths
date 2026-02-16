import { copyFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const manualSource = path.join(rootDir, "MANUAL.txt");
const manualName = "MANUAL.txt";

const desktopOutputTargets = [
  path.join(rootDir, "dist", "geeky-punks-converter"),
  path.join(rootDir, "release"),
  path.join(rootDir, "release", "Geeky Punks converter (Windows)"),
  path.join(rootDir, "release", "Geeky Punks converter (Linux x64)"),
  path.join(rootDir, "release", "Geeky Punks converter (Linux ARM64)"),
  path.join(rootDir, "release", "Geeky Punks converter (Linux ARMHF)"),
  path.join(rootDir, "web", "downloads"),
];

const macBundleManualTargets = [
  path.join(rootDir, "release", "Geeky Punks converter (macOS ARM).app", "Contents", "MANUAL.txt"),
  path.join(rootDir, "release", "Geeky Punks converter (macOS Intel).app", "Contents", "MANUAL.txt"),
  path.join(rootDir, "release", "Geeky Punks converter (macOS Universal).app", "Contents", "MANUAL.txt"),
];

async function run() {
  if (!existsSync(manualSource)) {
    throw new Error(`Missing manual source file: ${manualSource}`);
  }

  const written = [];
  for (const dir of desktopOutputTargets) {
    if (!existsSync(dir)) {
      continue;
    }
    const destination = path.join(dir, manualName);
    await copyFile(manualSource, destination);
    written.push(destination);
  }

  for (const macManual of macBundleManualTargets) {
    if (existsSync(macManual)) {
      await rm(macManual, { force: true });
    }
  }

  const downloadDir = path.join(rootDir, "web", "downloads");
  const zipTargets = await collectDesktopZips(downloadDir);
  const updatedZips = [];

  for (const zipPath of zipTargets) {
    await zipInjectManual(zipPath, manualSource);
    updatedZips.push(zipPath);
  }

  const report = {
    manualSource,
    written,
    updatedZips,
  };

  const reportPath = path.join(rootDir, "dist", "geeky-punks-converter", "MANUAL.distribution.json");
  if (existsSync(path.dirname(reportPath))) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(`MANUAL distribution complete: ${written.length} files written, ${updatedZips.length} zip artifacts updated.`);
}

async function collectDesktopZips(downloadDir) {
  if (!existsSync(downloadDir)) {
    return [];
  }

  const entries = await readdir(downloadDir);
  const zips = [];

  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".zip")) {
      continue;
    }
    if (!name.startsWith("Geeky-Punks-converter-")) {
      continue;
    }
    const fullPath = path.join(downloadDir, name);
    const info = await stat(fullPath);
    if (!info.isFile()) {
      continue;
    }
    zips.push(fullPath);
  }

  return zips;
}

function zipInjectManual(zipPath, manualPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("zip", ["-q", "-j", zipPath, manualPath], {
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`zip command failed for ${zipPath} with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

run().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
