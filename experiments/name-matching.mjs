#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Experiment: how often does name matching fail across languages and scripts?
//
// For each Last.fm tag (russian, j-pop, arabic, greek…), take the top artists,
// ask Last.fm for their similar artists (exactly like Overture will), and
// measure:
//   1. Query failures      seed name not found by artist.getSimilar (code 6)
//   2. Autocorrections     Last.fm answered for a differently spelled name
//   3. Self-duplicates     the seed appears in its own similar list
//                          (same name, or same MusicBrainz ID under another name)
//   4. Known-artist leaks  a "new" recommendation that is actually an artist
//                          the user already knows, under another name
//                          (detected through MusicBrainz IDs, so a LOWER BOUND)
//   5. Cross-script pairs  high-match similar artists written in another
//                          script than the seed, for manual review. Pairs are
//                          deduplicated across tags, and the "verdict" column
//                          you fill in (same / different / related / unsure)
//                          is kept when you run the script again.
//   6. MBID coverage       how often Last.fm gives a MusicBrainz ID at all,
//                          and how many suspects the MBID check cannot verify
//
// The simulation for (4): a fictional user knows every top artist of a tag,
// so any similar artist that shares an MBID with a known artist, but whose
// name doesn't match after normalizeArtist(), would be wrongly recommended.
//
// Run from the repo root:
//   node experiments/name-matching.mjs                 (all tags, 100 per tag)
//   node experiments/name-matching.mjs --per-tag 20    (quick run)
//   node experiments/name-matching.mjs --tags russian,arabic --per-tag 50
//
// Every Last.fm response is cached in experiments/output/cache.json, so a run
// can be stopped (Ctrl+C) and resumed, and re-running the analysis is instant.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { lastfmGet, LastfmError } from "../extension/lastfm.js";
import { normalizeArtist } from "../extension/shared/normalize.js";


// ── Settings ────────────────────────────────────────────────────────────────

// Last.fm tags, grouped by the language/script they mostly cover.
// Tags are user-made on Last.fm: a few may return fewer artists than asked.
const TAG_GROUPS = {
    "English":            ["pop", "rock", "hip-hop", "indie", "british", "american"],
    "Russian / Cyrillic":["russian", "ukrainian", "russian pop", "russian rap"],
    "Chinese":            ["chinese", "mandopop", "cantopop", "c-pop"],
    "Japanese":           ["japanese", "j-pop", "j-rock", "anime"],
    "Korean":             ["korean", "k-pop"],
    "Arabic":             ["arabic", "khaleeji", "rai", "egyptian"],
    "Greek":              ["greek", "laiko"],
    "Hebrew":             ["israeli", "hebrew"],
    "Persian":            ["persian", "iranian"],
    "Turkish":            ["turkish", "turkish pop"],
    "Indian":             ["bollywood", "hindi", "punjabi"],
    "Thai":               ["thai", "t-pop"],
    "Spanish / Latin":    ["latin", "reggaeton", "spanish", "latin pop"],
    "Portuguese":         ["brazilian", "mpb", "portuguese"],
    "French":             ["french", "chanson", "french rap"],
    "Armenian / Georgian":["armenian", "georgian"],
    "Vietnamese":         ["vietnamese", "v-pop"],
};

const { values: args } = parseArgs({
    options: {
        "per-tag":      { type: "string", default: "100" },  // top artists per tag
        "similar":      { type: "string", default: "15" },   // similar artists per seed (Overture's setting)
        "tags":         { type: "string" },                  // comma-separated subset, e.g. "russian,arabic"
        "delay":        { type: "string", default: "250" },  // ms between network calls (be nice to Last.fm)
        "suspect-match":{ type: "string", default: "0.8" },  // min match for cross-script suspects
        "review":       { type: "string", default: "10" },   // suspects per language group marked "review first"
    },
});
const REVIEW_PER_GROUP = Number(args["review"]);

const PER_TAG = Number(args["per-tag"]);
const SIMILAR_LIMIT = Number(args["similar"]);
const DELAY_MS = Number(args["delay"]);
const SUSPECT_MATCH = Number(args["suspect-match"]);

const ALL_TAGS = Object.entries(TAG_GROUPS).flatMap(([group, tags]) => tags.map((tag) => ({ tag, group })));
const TAGS = args.tags
    ? args.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => ALL_TAGS.find((x) => x.tag === tag) ?? { tag, group: "Custom" })
    : ALL_TAGS;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "output");
const CACHE_FILE = path.join(OUT_DIR, "cache.json");


// ── Cached, throttled, retrying Last.fm calls ──────────────────────────────

let cache = {};
let unsavedCalls = 0;
let networkCalls = 0;

async function loadCache()
{
    try { cache = JSON.parse(await fs.readFile(CACHE_FILE, "utf8")); }
    catch { cache = {}; }
}

async function saveCache()
{
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache));
    unsavedCalls = 0;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE = new Set([8, 11, 16, 29, "NETWORK", "BAD_RESPONSE"]);

// Returns { body } or { error: { code, message } }. Never throws for Last.fm errors.
async function cachedGet(method, params)
{
    const key = `${method}|${JSON.stringify(params)}`;
    if (key in cache) return cache[key];

    let result;
    for (let attempt = 0; ; attempt++)
    {
        await sleep(DELAY_MS);
        networkCalls++;
        try
        {
            result = { body: await lastfmGet(method, params) };
            break;
        }
        catch (err)
        {
            if (!(err instanceof LastfmError)) throw err;          // a bug, not a Last.fm problem
            if (RETRYABLE.has(err.code) && attempt < 3)
            {
                const wait = [2000, 5000, 15000][attempt];
                console.log(`   ⚠ ${err.code} (${err.message}), retrying in ${wait / 1000}s`);
                await sleep(wait);
                continue;
            }
            result = { error: { code: err.code, message: err.message } };
            break;
        }
    }

    // Only cache answers that will not change: successes and "not found"
    if (result.body || result.error.code === 6) cache[key] = result;
    if (++unsavedCalls >= 25) await saveCache();
    return result;
}


// ── Helpers ─────────────────────────────────────────────────────────────────

// Last.fm sometimes returns a single item as an object instead of a one-item array
const toArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

const cleanMbid = (mbid) => (typeof mbid === "string" && mbid.trim() !== "" ? mbid.trim() : null);

// Dominant writing system of a name, from Unicode script properties
const SCRIPTS = ["Latin", "Cyrillic", "Greek", "Arabic", "Hebrew", "Han", "Hiragana", "Katakana",
    "Hangul", "Thai", "Devanagari", "Gurmukhi", "Armenian", "Georgian"];
const SCRIPT_RE = Object.fromEntries(SCRIPTS.map((s) => [s, new RegExp(`\\p{Script=${s}}`, "gu")]));

function scriptOf(name)
{
    const counts = {};
    for (const s of SCRIPTS) counts[s] = (name.match(SCRIPT_RE[s]) ?? []).length;
    // Kana means Japanese, even when mixed with kanji
    if (counts.Hiragana + counts.Katakana > 0) return "Japanese";
    const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return n > 0 ? best : "Other";   // "Other": digits/symbols only, e.g. "112", "!!!"
}

const pct = (part, total) => (total === 0 ? "–" : `${((100 * part) / total).toFixed(1)}%`);

function csv(rows)
{
    const escape = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return rows.map((r) => r.map(escape).join(",")).join("\n") + "\n";
}

// Minimal CSV reader (handles quoted fields), to keep hand-written verdicts across runs
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

// A pair is the same whichever side is the seed: "A ↔ B" = "B ↔ A"
const pairKey = (a, b) => [normalizeArtist(a), normalizeArtist(b)].sort().join(" ↔ ");

// Stable pseudo-random number from a string (FNV-1a), so the "review first"
// sample is random but identical on every run and doesn't move under your labels
function stableHash(text)
{
    let h = 2166136261;
    for (const ch of text) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h;
}

const VERDICTS = new Set(["same", "different", "related", "unsure"]);

// Verdicts you typed into suspects.csv on a previous run: pairKey → verdict
async function loadVerdicts(file)
{
    const verdicts = new Map();
    let text;
    try { text = await fs.readFile(file, "utf8"); }
    catch { return verdicts; }

    const [header, ...rows] = parseCsv(text);
    if (!header) return verdicts;
    const col = (name) => header.indexOf(name);
    const [iSeed, iSimilar, iVerdict] = [col("seed"), col("similar"), col("verdict")];
    if (iSeed < 0 || iSimilar < 0 || iVerdict < 0) return verdicts;

    for (const r of rows)
    {
        const verdict = (r[iVerdict] ?? "").trim().toLowerCase();
        if (VERDICTS.has(verdict) && r[iSeed] && r[iSimilar]) verdicts.set(pairKey(r[iSeed], r[iSimilar]), verdict);
    }
    return verdicts;
}


// ── Data collection ─────────────────────────────────────────────────────────

async function topArtistsForTag(tag)
{
    const { body, error } = await cachedGet("tag.gettopartists", { tag, limit: PER_TAG });
    if (error) { console.log(`   ✖ tag "${tag}": ${error.code} ${error.message}`); return []; }
    return toArray(body?.topartists?.artist)
        .filter((a) => typeof a?.name === "string" && a.name.trim() !== "")
        .map((a) => ({ name: a.name, mbid: cleanMbid(a.mbid) }));
}

async function similarFor(seedName)
{
    const { body, error } = await cachedGet("artist.getsimilar", { artist: seedName, limit: SIMILAR_LIMIT, autocorrect: 1 });
    if (error) return { error };
    const block = body?.similarartists ?? {};
    return {
        resolvedAs: block["@attr"]?.artist ?? seedName,
        similar: toArray(block.artist)
            .filter((s) => typeof s?.name === "string")
            .map((s) => ({ name: s.name, match: Number(s.match), mbid: cleanMbid(s.mbid) })),
    };
}


// ── Main ────────────────────────────────────────────────────────────────────

async function main()
{
    await loadCache();
    process.on("SIGINT", async () => { console.log("\nStopped, saving cache…"); await saveCache(); process.exit(130); });

    const maxCalls = TAGS.length * (PER_TAG + 1);
    console.log(`${TAGS.length} tags × ${PER_TAG} artists, ${SIMILAR_LIMIT} similar each.`);
    console.log(`Up to ${maxCalls} Last.fm calls (cached ones are free). First run: roughly ${Math.ceil((maxCalls * (DELAY_MS + 300)) / 60000)} min.\n`);

    const SUSPECTS_FILE = path.join(OUT_DIR, "suspects.csv");
    const previousVerdicts = await loadVerdicts(SUSPECTS_FILE);
    if (previousVerdicts.size > 0) console.log(`Keeping ${previousVerdicts.size} verdicts from your previous suspects.csv\n`);

    const perTag = [];          // stats per tag
    const suspects = new Map(); // pairKey → cross-script, high-match pair (manual review), deduplicated across tags
    const leaks = [];           // confirmed known-artist leaks (via MBID)
    const selfDupes = [];       // seed found in its own similar list under another name
    const mbidNames = new Map(); // mbid → Map(normalized name → display name)

    const rememberMbid = (mbid, name) =>
    {
        if (!mbid) return;
        if (!mbidNames.has(mbid)) mbidNames.set(mbid, new Map());
        mbidNames.get(mbid).set(normalizeArtist(name), name);
    };

    for (const { tag, group } of TAGS)
    {
        console.log(`▶ ${tag} (${group})`);
        const seeds = await topArtistsForTag(tag);

        // The fictional user's library: every top artist of this tag
        const knownNames = new Set(seeds.map((s) => normalizeArtist(s.name)));
        const knownByMbid = new Map(seeds.filter((s) => s.mbid).map((s) => [s.mbid, s.name]));

        const stats = {
            tag, group, seeds: seeds.length, seedsWithMbid: 0, notFound: 0, otherErrors: 0, corrected: 0,
            candidates: 0, candidatesWithMbid: 0, crossScript: 0, crossScriptUncheckable: 0,
            suspects: 0, suspectsUncheckable: 0, selfDupes: 0, leaks: 0, scripts: {},
        };

        for (const [i, seed] of seeds.entries())
        {
            if (i > 0 && i % 25 === 0) console.log(`   ${i}/${seeds.length}`);
            const seedScript = scriptOf(seed.name);
            stats.scripts[seedScript] = (stats.scripts[seedScript] ?? 0) + 1;
            if (seed.mbid) stats.seedsWithMbid++;
            rememberMbid(seed.mbid, seed.name);

            const result = await similarFor(seed.name);
            if (result.error)
            {
                if (result.error.code === 6) stats.notFound++;
                else stats.otherErrors++;
                continue;
            }
            if (normalizeArtist(result.resolvedAs) !== normalizeArtist(seed.name)) stats.corrected++;

            for (const s of result.similar)
            {
                rememberMbid(s.mbid, s.name);
                const sameName = normalizeArtist(s.name) === normalizeArtist(seed.name);
                const sameMbid = seed.mbid && s.mbid === seed.mbid;

                // 3. The seed recommended to itself
                if (sameName || sameMbid)
                {
                    stats.selfDupes++;
                    if (!sameName) selfDupes.push([tag, seed.name, s.name, s.match, s.mbid]);
                    continue;
                }

                // Only "new" candidates from here: what Overture would recommend
                if (knownNames.has(normalizeArtist(s.name))) continue;
                stats.candidates++;
                if (s.mbid) stats.candidatesWithMbid++;

                // 4. Known artist under another name
                if (s.mbid && knownByMbid.has(s.mbid))
                {
                    stats.leaks++;
                    leaks.push([tag, seed.name, s.name, knownByMbid.get(s.mbid), s.match, s.mbid]);
                }

                // 5. Different script, high match: worth a human look
                const simScript = scriptOf(s.name);
                if (simScript !== seedScript && simScript !== "Other" && seedScript !== "Other")
                {
                    // "unknown": at least one side has no MBID, so the MBID check can't see this pair
                    const mbidCheck = seed.mbid && s.mbid ? (seed.mbid === s.mbid ? "same" : "different") : "unknown";
                    stats.crossScript++;
                    if (mbidCheck === "unknown") stats.crossScriptUncheckable++;

                    if (s.match >= SUSPECT_MATCH)
                    {
                        stats.suspects++;
                        if (mbidCheck === "unknown") stats.suspectsUncheckable++;

                        const key = pairKey(seed.name, s.name);
                        const existing = suspects.get(key);
                        if (existing) { if (!existing.tags.includes(tag)) existing.tags.push(tag); }
                        else
                        {
                            suspects.set(key, {
                                tags: [tag], group, seed: seed.name, seedScript, similar: s.name, simScript,
                                match: s.match, mbidCheck, verdict: previousVerdicts.get(key) ?? "",
                            });
                        }
                    }
                }
            }
        }
        perTag.push(stats);
    }

    await saveCache();

    // 6. Same MBID, several names: Last.fm duplicate/alias pages, confirmed
    const aliasGroups = [...mbidNames.entries()]
        .filter(([, names]) => names.size > 1)
        .map(([mbid, names]) => [mbid, [...names.values()].join(" | ")]);

    // ── Write results ──
    await fs.mkdir(OUT_DIR, { recursive: true });
    // Mark a small random sample per language group as "review first":
    // labeling ~10 per group is enough to estimate how many suspects are real duplicates
    const suspectList = [...suspects.values()];
    for (const p of suspectList) p.reviewFirst = false;
    const byGroup = Map.groupBy(suspectList, (p) => p.group);
    for (const pairs of byGroup.values())
    {
        pairs.sort((a, b) => stableHash(pairKey(a.seed, a.similar)) - stableHash(pairKey(b.seed, b.similar)));
        pairs.slice(0, REVIEW_PER_GROUP).forEach((p) => { p.reviewFirst = true; });
    }

    // Review-first rows on top, grouped by language, then highest match first
    suspectList.sort((a, b) =>
        (b.reviewFirst - a.reviewFirst) || a.group.localeCompare(b.group) || (b.match - a.match));
    await fs.writeFile(SUSPECTS_FILE, csv([
        ["review_first", "group", "tags", "seed", "seed_script", "similar", "similar_script", "match", "mbid_check", "verdict"],
        ...suspectList.map((p) => [p.reviewFirst ? "yes" : "", p.group, p.tags.join(" "), p.seed, p.seedScript,
            p.similar, p.simScript, p.match.toFixed(3), p.mbidCheck, p.verdict]),
    ]));

    // Per language group: how many suspects, and (from your verdicts) how many are real duplicates
    const groups = [...new Set(perTag.map((s) => s.group))].map((group) =>
    {
        const tags = perTag.filter((s) => s.group === group);
        const sum = (key) => tags.reduce((n, s) => n + s[key], 0);
        const pairs = byGroup.get(group) ?? [];
        const same = pairs.filter((p) => p.verdict === "same").length;
        const different = pairs.filter((p) => p.verdict === "different").length;
        const labeledHere = pairs.filter((p) => p.verdict !== "").length;
        return {
            group, seeds: sum("seeds"), candidates: sum("candidates"), crossScript: sum("crossScript"),
            suspectsPerTag: sum("suspects"), uniquePairs: pairs.length,
            noMbid: pairs.filter((p) => p.mbidCheck === "unknown").length,
            labeledHere, same, different,
            // Suspects per 1,000 recommendations: comparable across groups of different sizes
            rate: sum("candidates") === 0 ? 0 : (1000 * sum("suspects")) / sum("candidates"),
            // Estimated real duplicates per 1,000 recommendations, once you've labeled a sample
            estimated: same + different === 0 || sum("candidates") === 0
                ? null : ((1000 * sum("suspects")) / sum("candidates")) * (same / (same + different)),
        };
    }).sort((a, b) => b.rate - a.rate);
    const countBy = (key, value) => suspectList.filter((p) => p[key] === value).length;
    const labeled = { same: countBy("verdict", "same"), different: countBy("verdict", "different"),
        related: countBy("verdict", "related"), unsure: countBy("verdict", "unsure") };
    const labeledTotal = labeled.same + labeled.different + labeled.related + labeled.unsure;
    await fs.writeFile(path.join(OUT_DIR, "leaks.csv"),
        csv([["tag", "seed", "recommended_as", "already_known_as", "match", "mbid"], ...leaks]));
    await fs.writeFile(path.join(OUT_DIR, "self-duplicates.csv"),
        csv([["tag", "seed", "same_artist_listed_as", "match", "mbid"], ...selfDupes]));
    await fs.writeFile(path.join(OUT_DIR, "mbid-aliases.csv"),
        csv([["mbid", "names"], ...aliasGroups]));

    const total = (key) => perTag.reduce((sum, s) => sum + s[key], 0);
    const lines = [
        "# Name matching experiment",
        "",
        `Run: ${new Date().toISOString()} · ${TAGS.length} tags · ${PER_TAG} artists per tag · ${SIMILAR_LIMIT} similar each`,
        "",
        "> **How to read this.** \"Leaks (MBID)\" only counts duplicates that MusicBrainz IDs can prove, so it is a",
        "> *lower bound*. When an artist has no MBID, a duplicate is invisible to it. The \"Suspects\" columns show how",
        "> many high-match, cross-script pairs exist and how many of them the MBID check could not verify at all.",
        "> The true duplicate rate comes from the verdicts you write in suspects.csv.",
        "",
        "## By language group (highest suspect rate first)",
        "",
        "> *Suspects / 1,000* = cross-script, high-match pairs per 1,000 recommendations: how often a user of that",
        "> language would see a **possible** duplicate. Not all suspects are duplicates (scene peers like Toni Qattan",
        "> also show up), so label the `review_first` rows in suspects.csv: *Same* and *Est. duplicates / 1,000* then",
        "> turn the suspect rate into an estimated real error rate.",
        "",
        "| Group | Seeds | Recommendations | Cross-script | Suspects / 1,000 | Unique pairs | …no MBID | Labeled | Same | Different | Est. duplicates / 1,000 |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
        ...groups.map((g) => `| ${g.group} | ${g.seeds} | ${g.candidates} | ${pct(g.crossScript, g.candidates)} | **${g.rate.toFixed(1)}** | ${g.uniquePairs} | ${g.noMbid} | ${g.labeledHere} | ${g.same} | ${g.different} | ${g.estimated === null ? "–" : `**${g.estimated.toFixed(1)}**`} |`),
        "",
        "## By tag",
        "",
        `| Tag | Group | Main scripts | Seeds | Not found (6) | Autocorrected | Seed in own list | Leaks (MBID, lower bound) | Cross-script | Suspects (≥ ${SUSPECT_MATCH}) | …of which no MBID | MBID coverage |`,
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
        ...perTag.map((s) =>
        {
            const scripts = Object.entries(s.scripts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${v}`).join(", ");
            return `| ${s.tag} | ${s.group} | ${scripts} | ${s.seeds} | ${s.notFound} (${pct(s.notFound, s.seeds)}) | ${s.corrected} | ${s.selfDupes} | ${s.leaks} (${pct(s.leaks, s.candidates)}) | ${pct(s.crossScript, s.candidates)} | ${s.suspects} | ${s.suspectsUncheckable} (${pct(s.suspectsUncheckable, s.suspects)}) | seeds ${pct(s.seedsWithMbid, s.seeds)}, similar ${pct(s.candidatesWithMbid, s.candidates)} |`;
        }),
        "",
        "## Totals",
        "",
        "**Querying**",
        `- Seeds queried: ${total("seeds")}`,
        `- Not found (code 6): ${total("notFound")} (${pct(total("notFound"), total("seeds"))})`,
        `- Other errors after retries: ${total("otherErrors")}`,
        `- Autocorrected to another name: ${total("corrected")}`,
        "",
        "**Duplicates the MBID check can prove (lower bound)**",
        `- Seed listed as its own similar artist: ${total("selfDupes")} (${selfDupes.length} under a different name, see self-duplicates.csv)`,
        `- Known-artist leaks: ${total("leaks")} (${pct(total("leaks"), total("candidates"))} of ${total("candidates")} new candidates)`,
        `- Same MBID under several names: ${aliasGroups.length} (see mbid-aliases.csv)`,
        "",
        "**What the MBID check cannot see**",
        `- MBID coverage: seeds ${pct(total("seedsWithMbid"), total("seeds"))}, candidates ${pct(total("candidatesWithMbid"), total("candidates"))}`,
        `- Candidates in another script than their seed: ${total("crossScript")} (${pct(total("crossScript"), total("candidates"))}), of which ${total("crossScriptUncheckable")} (${pct(total("crossScriptUncheckable"), total("crossScript"))}) have no MBID on one side`,
        `- Cross-script suspects with match ≥ ${SUSPECT_MATCH}: ${suspectList.length} unique pairs; MBID check: ${countBy("mbidCheck", "same")} same, ${countBy("mbidCheck", "different")} different, **${countBy("mbidCheck", "unknown")} unknown**`,
        "",
        "**Your hand review (verdict column in suspects.csv)**",
        `- Review-first sample: ${suspectList.filter((p) => p.reviewFirst).length} pairs (${REVIEW_PER_GROUP} per language group), labeled: ${suspectList.filter((p) => p.reviewFirst && p.verdict !== "").length}`,
        labeledTotal === 0
            ? "- No verdicts yet. Fill the verdict column of the review_first rows with: same / different / related / unsure, then run again."
            : `- Labeled: ${labeledTotal} of ${suspectList.length} pairs · same ${labeled.same} · different ${labeled.different} · related ${labeled.related} · unsure ${labeled.unsure}`,
        ...(labeled.same + labeled.different > 0
            ? [`- **Share of suspects that are the same artist: ${pct(labeled.same, labeled.same + labeled.different)}** (same / (same + different))`,
               `- Same-artist pairs the MBID check missed: ${suspectList.filter((p) => p.verdict === "same" && p.mbidCheck !== "same").length} of ${labeled.same}`]
            : []),
        "",
        `Network calls this run: ${networkCalls}`,
        "",
    ];
    await fs.writeFile(path.join(OUT_DIR, "summary.md"), lines.join("\n"));
    console.log("\n" + lines.slice(2).join("\n"));
    console.log(`Results written to ${path.relative(process.cwd(), OUT_DIR)}/`);
}

main().catch(async (err) =>
{
    console.error(err);
    await saveCache();
    process.exit(1);
});
