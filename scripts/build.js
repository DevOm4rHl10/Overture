#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Builds the Chrome Web Store package: dist/overture-<version>.zip
//
//   node scripts/build.js
//
// Steps (it stops at the first problem):
//   1. Runs the unit tests (node --test). Skip with --skip-tests.
//   2. Checks extension/config.js: present, no placeholder left, Spotify asks
//      only for the scopes Overture uses.
//   3. Checks background.js has no development handlers (TEST_*) or timers.
//   4. Copies extension/ to dist/overture/ without config.example.js, and
//      removes "key" from manifest.json (the Web Store gives its own ID and
//      refuses manifests with a key).
//   5. Zips dist/overture/ into dist/overture-<version>.zip.
//
// dist/ is git-ignored: the zip contains your real API keys, never commit it.
// Needs the `zip` command (preinstalled on most Linux and macOS systems).
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "extension");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "overture");

const SCOPES_USED = ["user-top-read"];                 // /me/top/artists only
const LEAVE_OUT = new Set(["config.example.js"]);     // files not shipped

const fail = (message) => {
    console.error(`\n✗ ${message}\n`);
    process.exit(1);
};
const ok = (message) => console.log(`✓ ${message}`);
const warnings = [];

// 1. Tests ────────────────────────────────────────────────────────────────────
if (!process.argv.includes("--skip-tests")) {
    try {
        execFileSync(process.execPath, ["--test"], { cwd: ROOT, stdio: "pipe" });
        ok("unit tests pass");
    } catch (err) {
        const out = `${err.stdout ?? ""}`.split("\n").filter((l) => /^# (tests|pass|fail)/.test(l)).join(", ");
        fail(`unit tests fail (${out || "see node --test"}). Fix them before building.`);
    }
}

// 2. config.js ────────────────────────────────────────────────────────────────
let configText;
try {
    configText = await fs.readFile(path.join(SRC, "config.js"), "utf8");
} catch {
    fail("extension/config.js is missing. Copy config.example.js and fill in your keys.");
}
if (/YOUR /i.test(configText)) fail("extension/config.js still has a placeholder (\"YOUR …\"). Fill in your real keys.");
const config = await import(path.join(SRC, "config.js"));
for (const name of ["SPOTIFY_CLIENT_ID", "LASTFM_API_KEY"]) {
    if (typeof config[name] !== "string" || config[name].trim() === "") fail(`config.js: ${name} is empty.`);
}
const extra = (config.SPOTIFY_SCOPES ?? []).filter((s) => !SCOPES_USED.includes(s));
if (extra.length) {
    fail(`config.js asks Spotify for scopes Overture doesn't use: ${extra.join(", ")}.\n`
        + `  Set SPOTIFY_SCOPES = ${JSON.stringify(SCOPES_USED)} (the privacy policy only covers these).`);
}
ok("config.js has real keys and only the scopes used");

// 3. background.js ────────────────────────────────────────────────────────────
const background = await fs.readFile(path.join(SRC, "background.js"), "utf8");
const testHandlers = [...background.matchAll(/\b(TEST_[A-Z_]+)\s*\(/g)].map((m) => m[1]);
if (testHandlers.length) fail(`background.js still has development handlers: ${[...new Set(testHandlers)].join(", ")}. Delete them.`);
if (/console\.time(End)?\(/.test(background)) warnings.push("background.js still calls console.time / console.timeEnd.");
ok("background.js has no development handlers");

// 4. Copy ─────────────────────────────────────────────────────────────────────
await fs.rm(DIST, { recursive: true, force: true });
await fs.cp(SRC, OUT, {
    recursive: true,
    filter: (src) => !LEAVE_OUT.has(path.basename(src)) && !path.basename(src).startsWith("."),
});
const manifestPath = path.join(OUT, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
delete manifest.key;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
ok(`copied extension/ to dist/overture/ (manifest without "key", version ${manifest.version})`);

// 5. Zip ──────────────────────────────────────────────────────────────────────
const zipName = `overture-${manifest.version}.zip`;
try {
    execFileSync("zip", ["-r", "-q", "-X", path.join("..", zipName), "."], { cwd: OUT });
} catch {
    fail("the `zip` command failed or isn't installed (sudo apt install zip).");
}
const { size } = await fs.stat(path.join(DIST, zipName));
ok(`dist/${zipName} (${(size / 1024).toFixed(0)} KB)`);

for (const w of warnings) console.log(`! ${w}`);
console.log(`\nUpload dist/${zipName} in the Chrome Web Store developer dashboard.`);
console.log("Before each new upload, raise \"version\" in extension/manifest.json.\n");
