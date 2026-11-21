// experiments/obscurity-compare.js
//
// Question: which obscurity formula, at which strength, gives the best top 20
// for a real profile?
//
// Compares 6 options side by side on YOUR real pool:
//   baseline (no obscurity), power, log, percentile, blend, window
// and prints, for each: the top 20 names, plus 4 numbers per variant
// (median listeners of the top 20, overlap with baseline, tiny pages in the
// top 20, biggest share taken by one seed).
//
// IMPORTANT: this script builds a ROUGH candidate pool by itself
// (Σ match × weight, grouped by normalizeArtist, known artists and ", "
// collaborations removed, no Layer 2 merging, no per-seed cap).
// It is a stand-in so you can compare formulas before ranking.js exists.
// It is NOT the product logic: your ranking.js decides that. Once your
// functions exist, swap buildRoughPool() for them.
//
// HOW TO RUN (browser):
//   1. Reload the extension, open the popup, right-click it → Inspect
//      (the POPUP console, not the service worker: the service worker
//      can't import modules from the console)
//   2. Signed in to Spotify. TEST_GRAPH and TEST_SOURCE must exist.
//   3. Paste this whole file, press Enter. First run ≈ 15 s (40 getInfo
//      calls), then cached for a day.
//   4. Send Claude the "Summary" table and the JSON at the end.

(async () => {

    // ------------------------------------------------------------ settings

    const POOL_SIZE = 40;
    const SHOW_TOP = 20;
    const MIN_LISTENERS = 50;     // below this: never boosted (duplicate/dead pages)
    const CLAMP_MIN = 0.25;       // power: smallest multiplier
    const CLAMP_MAX = 4;          // power: largest multiplier
    const LOG_FLOOR = 0.1;        // log: smallest multiplier
    const WINDOW_SIGMA = 1.5;     // window: width in natural-log units
    const INFO_TTL_MS = 24 * 60 * 60 * 1000;
    const INFO_PREFIX = "exp-info:";   // separate from the product's future "info:" keys

    // Strengths to compare. For "window", the value is the target r
    // (listeners / pool median) instead of a strength.
    const VARIANTS = [
        ["baseline", 0],
        ["power", 0.3], ["power", 0.6], ["power", 1],
        ["log", 0.3], ["log", 0.6], ["log", 1],
        ["percentile", 0.3], ["percentile", 0.6], ["percentile", 1],
        ["blend", 0.3], ["blend", 0.6], ["blend", 1],
        ["window", 1], ["window", 0.3], ["window", 0.1]
    ];

    // ------------------------------------------------------------- modules

    const url = (p) => chrome.runtime.getURL(p);
    const { lastfmGet, LastfmError } = await import(url("lastfm.js"));
    const { normalizeArtist } = await import(url("shared/normalize.js"));
    const { isSameArtist } = await import(url("shared/transliterate.js"));
    const { cacheGet, cacheSet } = await import(url("cache.js"));

    // ---------------------------------------------------------------- data

    const send = (type) => chrome.runtime.sendMessage({ type });

    const graphResponse = await send("TEST_GRAPH");
    if (!graphResponse || !Array.isArray(graphResponse.graph)) {
        console.error("TEST_GRAPH didn't return { graph }. Got:", graphResponse);
        return;
    }
    const graph = graphResponse.graph;

    // Known artists: full source list (weight 0 included) from TEST_SOURCE.
    // Its response shape may vary, so take the first array of { name } found.
    function findArtistArray(value) {
        if (Array.isArray(value) && value.length > 0 && value.every(a => a && typeof a.name === "string")) {
            return value;
        }
        if (value && typeof value === "object") {
            for (const v of Object.values(value)) {
                const found = findArtistArray(v);
                if (found) return found;
            }
        }
        return null;
    }

    let known = null;
    try {
        known = findArtistArray(await send("TEST_SOURCE"));
    } catch (e) {
        console.warn("TEST_SOURCE failed, using graph sources as known artists:", e);
    }
    if (!known) {
        console.warn("No artist list from TEST_SOURCE: using graph sources (weight-0 artists won't be filtered).");
        known = graph.map(g => ({ name: g.source }));
    }
    const knownNames = known.map(a => a.name);

    console.log(`Graph: ${graph.length} seeds. Known artists: ${knownNames.length}.`);

    // ------------------------------------------------- rough pool (stand-in)

    function isKnown(name) {
        return knownNames.some(k => isSameArtist(name, k));
    }

    function isKnownCollaboration(name) {
        const parts = name.split(", ").map(p => p.trim()).filter(Boolean);
        return parts.length >= 2 && parts.some(isKnown);
    }

    function buildRoughPool() {
        const byKey = new Map();

        for (const seed of graph) {
            for (const s of seed.similar) {
                const key = normalizeArtist(s.name);
                const contribution = s.match * seed.weight;

                let c = byKey.get(key);
                if (!c) {
                    c = { name: s.name, url: s.url, best: contribution, because: new Map() };
                    byKey.set(key, c);
                }
                if (contribution > c.best) {
                    c.best = contribution;
                    c.name = s.name;
                    c.url = s.url;
                }
                const prev = c.because.get(seed.source) ?? 0;
                c.because.set(seed.source, Math.max(prev, contribution));
            }
        }

        const all = [...byKey.values()].map(c => {
            const because = [...c.because.entries()]
                .map(([source, contribution]) => ({ source, contribution }))
                .sort((a, b) => b.contribution - a.contribution);
            return {
                name: c.name,
                url: c.url,
                because,
                score: because.reduce((sum, b) => sum + b.contribution, 0)
            };
        });

        const totalCandidates = all.length;
        const kept = all.filter(c => !isKnown(c.name) && !isKnownCollaboration(c.name));
        kept.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

        console.log(`Candidates: ${totalCandidates} → ${kept.length} after removing known artists and collaborations.`);
        return kept.slice(0, POOL_SIZE);
    }

    const pool = buildRoughPool();

    // ------------------------------------------------------------- getInfo

    async function listenersFor(name) {
        const key = INFO_PREFIX + normalizeArtist(name);

        try {
            const cached = await cacheGet(key);
            if (cached && typeof cached === "object" && "listeners" in cached) return cached.listeners;
        } catch (e) {
            console.warn("cache read failed", e);
        }

        let listeners = null;
        try {
            const data = await lastfmGet("artist.getinfo", { artist: name, autocorrect: 1 });
            const raw = data?.artist?.stats?.listeners;
            const n = Number(raw);
            listeners = (raw !== undefined && raw !== "" && Number.isFinite(n) && n >= 0) ? n : null;
        } catch (e) {
            if (e instanceof LastfmError && e.code === 6) {
                return null;                       // unknown: not cached
            }
            throw e;                               // anything else: stop
        }

        try {
            await cacheSet(key, { listeners }, INFO_TTL_MS);
        } catch (e) {
            console.warn("cache write failed", e);
        }
        return listeners;
    }

    const t0 = performance.now();
    for (const c of pool) {
        c.listeners = await listenersFor(c.name);
    }
    console.log(`getInfo for ${pool.length} candidates: ${Math.round(performance.now() - t0)} ms`);

    // ------------------------------------------------------------- formulas

    const median = (xs) => {
        const s = [...xs].sort((a, b) => a - b);
        if (s.length === 0) return null;
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };

    const known_ = pool.map(c => c.listeners).filter(n => typeof n === "number" && n > 0);
    const reference = median(known_);
    console.log(`Pool median listeners (reference): ${reference?.toLocaleString() ?? "none"}`);

    if (!reference) {
        console.error("No listener counts in the pool: can't compare formulas.");
        return;
    }

    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const hasCount = (c) => typeof c.listeners === "number" && c.listeners > 0;
    const isTiny = (c) => typeof c.listeners === "number" && c.listeners < MIN_LISTENERS;

    // Percentile by listeners within the pool: 0 = least known, 1 = most known
    const counted = pool.filter(hasCount).sort((a, b) => a.listeners - b.listeners);
    const percentile = new Map();
    counted.forEach((c, i) => percentile.set(c, counted.length > 1 ? i / (counted.length - 1) : 0.5));

    // Similarity rank: 1 = best score, 0 = worst (pool is already sorted)
    const simRank = new Map();
    pool.forEach((c, i) => simRank.set(c, pool.length > 1 ? 1 - i / (pool.length - 1) : 1));

    // Unknown listener count: treated as a typical artist of the scene
    // (r = 1, percentile 0.5), so it is neither boosted nor buried.
    function multiplier(kind, s, c) {
        const r = hasCount(c) ? c.listeners / reference : 1;
        const p = hasCount(c) ? percentile.get(c) : 0.5;
        let f;

        switch (kind) {
            case "baseline":
                return 1;
            case "power":
                f = clamp(Math.pow(1 / r, s), CLAMP_MIN, CLAMP_MAX);
                break;
            case "log":
                f = Math.max(LOG_FLOOR, 1 + s * Math.log(1 / r));
                break;
            case "percentile":
                f = 1 + s * (1 - p);
                break;
            case "window": {
                const d = Math.log(r / s);               // s = target r here
                f = Math.exp(-(d * d) / (2 * WINDOW_SIGMA * WINDOW_SIGMA));
                return f;                                // window already handles tiny pages
            }
            default:
                throw new Error("unknown formula " + kind);
        }

        if (isTiny(c)) f = Math.min(f, 1);               // never boost tiny pages
        return f;
    }

    function finalScore(kind, s, c) {
        if (kind === "blend") {
            const obs = hasCount(c) ? 1 - percentile.get(c) : 0.5;
            let value = (1 - s) * simRank.get(c) + s * obs;
            if (isTiny(c)) value = (1 - s) * simRank.get(c);      // no obscurity credit
            return value;
        }
        return c.score * multiplier(kind, s, c);
    }

    // ------------------------------------------------------------------ run

    const label = (kind, s) => kind === "baseline" ? "baseline"
        : kind === "window" ? `window t=${s}` : `${kind} s=${s}`;

    const results = {};
    for (const [kind, s] of VARIANTS) {
        const ranked = pool
            .map(c => ({ c, v: finalScore(kind, s, c) }))
            .sort((a, b) => b.v - a.v || a.c.name.localeCompare(b.c.name))
            .slice(0, SHOW_TOP)
            .map(x => x.c);
        results[label(kind, s)] = ranked;
    }

    const baselineTop = new Set(results["baseline"]);

    // Summary: one row per variant
    const summary = {};
    for (const [name, top] of Object.entries(results)) {
        const counts = top.filter(hasCount).map(c => c.listeners);
        const perSeed = new Map();
        for (const c of top) {
            const main = c.because[0]?.source ?? "?";
            perSeed.set(main, (perSeed.get(main) ?? 0) + 1);
        }
        const [topSeed, topSeedCount] = [...perSeed.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];

        summary[name] = {
            "median listeners": Math.round(median(counts) ?? 0).toLocaleString(),
            "same as baseline": `${top.filter(c => baselineTop.has(c)).length}/${top.length}`,
            [`tiny (<${MIN_LISTENERS})`]: top.filter(isTiny).length,
            "unknown count": top.filter(c => !hasCount(c)).length,
            "max from one seed": `${topSeedCount} (${topSeed})`
        };
    }

    console.log("%cSummary", "font-weight:bold;font-size:14px");
    console.table(summary);

    // One table per formula: rank × strength
    const fmt = (c) => `${c.name} (${hasCount(c) ? c.listeners.toLocaleString() : "?"})`;
    const families = ["power", "log", "percentile", "blend", "window"];

    for (const fam of families) {
        const cols = Object.keys(results).filter(k => k.startsWith(fam));
        const rows = [];
        for (let i = 0; i < SHOW_TOP; i++) {
            const row = { baseline: results["baseline"][i] ? fmt(results["baseline"][i]) : "" };
            for (const col of cols) row[col] = results[col][i] ? fmt(results[col][i]) : "";
            rows.push(row);
        }
        console.log(`%c${fam}`, "font-weight:bold;font-size:13px");
        console.table(rows);
    }

    // The pool itself, for reference
    console.log("%cPool (rough, before obscurity)", "font-weight:bold");
    console.table(pool.map(c => ({
        name: c.name,
        score: Number(c.score.toFixed(3)),
        listeners: c.listeners,
        r: hasCount(c) ? Number((c.listeners / reference).toFixed(3)) : null,
        "main seed": c.because[0]?.source,
        seeds: c.because.length
    })));

    // JSON to send back
    const out = {
        reference,
        poolSize: pool.length,
        summary,
        top: Object.fromEntries(Object.entries(results).map(([k, v]) =>
            [k, v.map(c => ({ name: c.name, listeners: c.listeners, main: c.because[0]?.source }))]))
    };
    console.log("Full results (copy this):");
    console.log(JSON.stringify(out));

})().catch(err => console.error(err));
