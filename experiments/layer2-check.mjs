#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Which artists does Layer 2 (isSameArtist) merge on real data?
//
// Reads every experiments/output*/artists.csv and suspects.csv produced by
// name-matching.mjs, collects all artist names (seeds and their similar
// artists), and lists every pair of names in DIFFERENT scripts that
// isSameArtist() considers the same artist.
//
// You only need to check that list: write same / different in the "verdict"
// column. Any "different" is a false merge: fix the rules, add the pair to
// tests/transliterate.test.js ("False merges found on real data"), re-run.
// Verdicts are kept when you run the script again.
//
// Run from the repo root (after name-matching.mjs):
//   node experiments/layer2-check.mjs
// Output: experiments/output/layer2-merges.csv
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isSameArtist, looseKey, skeletonKey } from "../extension/shared/transliterate.js";
import { normalizeArtist } from "../extension/shared/normalize.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(HERE, "output", "layer2-merges.csv");


// ── CSV helpers ─────────────────────────────────────────────────────────────

function parseCsv(text)
{
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++)
    {
        const c = text[i];
        if (quoted)
        {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        }
        else if (c === '"') quoted = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n" || c === "\r")
        {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field); rows.push(row); row = []; field = "";
        }
        else field += c;
    }
    if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

// Rows as objects keyed by the header
async function readCsv(file)
{
    let text;
    try { text = await fs.readFile(file, "utf8"); }
    catch { return []; }
    const [header, ...rows] = parseCsv(text);
    if (!header) return [];
    return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function csv(rows)
{
    const escape = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return rows.map((r) => r.map(escape).join(",")).join("\n") + "\n";
}

const pairKey = (a, b) => [normalizeArtist(a), normalizeArtist(b)].sort().join(" ↔ ");

const SCRIPTS = ["Latin", "Cyrillic", "Greek", "Armenian", "Georgian", "Arabic"];
function scriptOf(name)
{
    let best = "Other", n = 0;
    for (const s of SCRIPTS)
    {
        const count = (name.match(new RegExp(`\\p{Script=${s}}`, "gu")) ?? []).length;
        if (count > n) { best = s; n = count; }
    }
    return best;
}


// ── Main ────────────────────────────────────────────────────────────────────

async function main()
{
    const dirs = (await fs.readdir(HERE, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && d.name.startsWith("output"))
        .map((d) => path.join(HERE, d.name));

    // All names, with Last.fm listeners when known
    const listeners = new Map();
    const addName = (name, count = "") =>
    {
        const n = name?.trim();
        if (!n) return;
        if (!listeners.has(n) || (count && !listeners.get(n))) listeners.set(n, count);
    };
    for (const dir of dirs)
    {
        for (const r of await readCsv(path.join(dir, "artists.csv")))
        {
            addName(r.name, r.listeners);
            for (const s of (r.similar_top5 ?? "").split(" | ")) addName(s);
        }
        for (const r of await readCsv(path.join(dir, "suspects.csv")))
        {
            addName(r.seed);
            addName(r.similar);
        }
    }
    if (listeners.size === 0)
    {
        console.log("No artists.csv or suspects.csv found. Run experiments/name-matching.mjs first.");
        return;
    }

    // Verdicts from a previous run
    const verdicts = new Map();
    for (const r of await readCsv(OUT_FILE))
    {
        const v = (r.verdict ?? "").trim().toLowerCase();
        if (v) verdicts.set(pairKey(r.name_a, r.name_b), v);
    }

    // Only names sharing a key can match: bucket by key instead of comparing all pairs
    const buckets = new Map();
    for (const name of listeners.keys())
    {
        for (const key of [`L:${looseKey(name)}`, `S:${skeletonKey(name)}`])
        {
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(name);
        }
    }

    const merges = new Map();
    for (const names of buckets.values())
    {
        for (let i = 0; i < names.length; i++)
        {
            for (let j = i + 1; j < names.length; j++)
            {
                const [a, b] = [names[i], names[j]];
                if (normalizeArtist(a) === normalizeArtist(b)) continue;   // Layer 1, not interesting here
                const key = pairKey(a, b);
                if (merges.has(key) || !isSameArtist(a, b)) continue;
                merges.set(key, { a, b, verdict: verdicts.get(key) ?? "" });
            }
        }
    }

    // Unchecked first, then by script
    const list = [...merges.values()].sort((x, y) =>
        (x.verdict !== "") - (y.verdict !== "") ||
        scriptOf(x.a + x.b).localeCompare(scriptOf(y.a + y.b)) || x.a.localeCompare(y.a));

    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
    await fs.writeFile(OUT_FILE, csv([
        ["name_a", "script_a", "listeners_a", "name_b", "script_b", "listeners_b", "verdict"],
        ...list.map((m) => [m.a, scriptOf(m.a), listeners.get(m.a), m.b, scriptOf(m.b), listeners.get(m.b), m.verdict]),
    ]));

    // Summary
    const count = (v) => list.filter((m) => m.verdict === v).length;
    const bySystem = new Map();
    for (const m of list)
    {
        const s = [scriptOf(m.a), scriptOf(m.b)].filter((x) => x !== "Latin")[0] ?? "Latin";
        bySystem.set(s, (bySystem.get(s) ?? 0) + 1);
    }
    console.log(`Names checked: ${listeners.size} (from ${dirs.map((d) => path.basename(d)).join(", ")})`);
    console.log(`Layer 2 merges: ${list.length}  ·  ${[...bySystem].map(([s, n]) => `${s} ${n}`).join(", ")}`);
    console.log(`Checked: ${list.length - count("")}  ·  same ${count("same")}  ·  different ${count("different")}  ·  unsure ${count("unsure")}`);
    const falseMerges = list.filter((m) => m.verdict === "different");
    if (falseMerges.length > 0)
    {
        console.log("\n⚠ FALSE MERGES (add them to tests/transliterate.test.js, then fix the rules):");
        for (const m of falseMerges) console.log(`   ${m.a} ↔ ${m.b}`);
    }
    else if (count("same") > 0) console.log("\n✔ No false merges among the checked pairs.");
    console.log(`\nWritten to ${path.relative(process.cwd(), OUT_FILE)}: fill the verdict column (same / different / unsure).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
