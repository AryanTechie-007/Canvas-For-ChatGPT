#!/usr/bin/env node
/**
 * Builds and packages both Chromium (Manifest V3) and Firefox (Manifest V2)
 * release ZIP archives into build/.
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT_DIR, "build");
const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")
);
const versionTag = pkg.manifest?.version_name || `v${pkg.version}`;

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: ROOT_DIR, stdio: "inherit" });
}

function sanitizeFirefoxManifest() {
  const ffManifestPath = path.join(BUILD_DIR, "firefox-mv2-prod", "manifest.json");
  if (!fs.existsSync(ffManifestPath)) {
    throw new Error(`Missing Firefox manifest at ${ffManifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(ffManifestPath, "utf8"));
  // Remove Chromium-only version_name so Firefox / AMO reports zero manifest warnings
  delete manifest.version_name;
  fs.writeFileSync(ffManifestPath, JSON.stringify(manifest));
  console.log("Sanitized Firefox manifest.json (removed version_name)");
}

function zipDirectory(sourceDir, outZipPath) {
  if (fs.existsSync(outZipPath)) {
    fs.unlinkSync(outZipPath);
  }
  if (process.platform === "win32") {
    const src = sourceDir.replace(/'/g, "''");
    const dst = outZipPath.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${src}', '${dst}')"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`zip -r -q "${outZipPath}" .`, { cwd: sourceDir, stdio: "inherit" });
  }
}

function main() {
  run("npx plasmo build");
  run("npx plasmo build --target=firefox-mv2");
  sanitizeFirefoxManifest();

  const chromeOut = path.join(
    BUILD_DIR,
    `canvas-for-chatgpt-${versionTag}.zip`
  );
  const firefoxOut = path.join(
    BUILD_DIR,
    `canvas-for-chatgpt-${versionTag}-firefox.zip`
  );

  zipDirectory(path.join(BUILD_DIR, "chrome-mv3-prod"), chromeOut);
  zipDirectory(path.join(BUILD_DIR, "firefox-mv2-prod"), firefoxOut);

  const chromeBytes = fs.statSync(chromeOut).size;
  const firefoxBytes = fs.statSync(firefoxOut).size;
  console.log(`Created ${path.basename(chromeOut)} (${chromeBytes} bytes)`);
  console.log(`Created ${path.basename(firefoxOut)} (${firefoxBytes} bytes)`);
}

main();
