// ─────────────────────────────────────────────────────────────────────────────
// End-to-end test: the whole recommendation pipeline against the REAL Last.fm
// API (and optionally your real Spotify account).
//
//   typed artists or Spotify → source adapter → buildSimilarityGraph (Last.fm
//   getSimilar, cached) → buildPool (Layer 1 + 2, collaborations, merges,
//   per-seed cap) → getListenerCounts (Last.fm getInfo, cached) → rankPool
//   (obscurity, final cap) → recommendations
//
// Unlike tests/*.test.js, this test uses the network and your real API key,
// so it is slower (~1–2 min) and is NOT run by a plain `node --test`.
//
// Run from the repo root:
//   node --test tests/e2e/pipeline.e2e.js
//
// With your Spotify account too (optional): copy a fresh access token from the
// extension's service worker console:
//   chrome.storage.local.get("spotifyTokens").then(r => console.log(r.spotifyTokens.accessToken))
// then:
//   SPOTIFY_ACCESS_TOKEN=<token> node --test tests/e2e/pipeline.e2e.js
// The token is valid for 1 hour. Never commit it or paste it anywhere.
//
// chrome.storage is replaced by an in-memory store, so the cache works exactly
// as in the extension (and starts empty on every run).
//
// Live data changes: if Last.fm stops returning an artist a test relies on,
// that test is SKIPPED with an explanation instead of failing.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test, before } from "node:test";
import assert from "node:assert/strict";

import { lastfmGet, LastfmError } from "../../extension/lastfm.js";
import { LASTFM_API_KEY } from "../../extension/config.js";
import { normalizeArtist, normalizeArtistList } from "../../extension/shared/normalize.js";
import { isSameArtist } from "../../extension/shared/transliterate.js";
import { loadArtists as loadSeeds } from "../../extension/sources/seeds.js";
import { loadArtists as loadSpotify } from "../../extension/sources/spotify.js";
import { getSimilarArtists, buildSimilarityGraph } from "../../extension/similarity.js";
import { buildPool, rankPool } from "../../extension/ranking.js";
import { getListenerCounts } from "../../extension/artistInfo.js";


// ── In-memory chrome.storage (cache + Spotify tokens) ──────────────────────

const memory = new Map();
globalThis.chrome = {
    storage: {
        local: {
            async get(key) { return memory.has(key) ? { [key]: structuredClone(memory.get(key)) } : {}; },
            async set(items) { for (const [k, v] of Object.entries(items)) memory.set(k, structuredClone(v)); },
            async remove(keys) { for (const k of [].concat(keys)) memory.delete(k); },
        },
    },
};


// ── Setup: is the real API usable? ──────────────────────────────────────────

const DELAY_MS = 250;   // between Last.fm calls: stay polite with the rate limit
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let liveProblem = null; // a reason to skip every live test, or null

before(async () =>
{
    if (!LASTFM_API_KEY || /YOUR_|^$/i.test(LASTFM_API_KEY))
    {
        liveProblem = "no Last.fm API key in extension/config.js";
        return;
    }
    try { await lastfmGet("artist.getinfo", { artist: "Radiohead" }); }
    catch (err)
    {
        liveProblem = err instanceof LastfmError
            ? `Last.fm unusable (${err.code}: ${err.message})`
            : `Last.fm unusable (${err.message})`;
    }
});

// Skip a live test when the API isn't reachable, with the reason
const live = (t) => { if (liveProblem) { t.skip(liveProblem); return false; } return true; };

// Skip a test whose input comes from an earlier test that didn't produce it
const needs = (t, value, what) => { if (value == null) { t.skip(`needs ${what} from the previous test`); return false; } return true; };

// The real Phase 4 function, with a polite pause (direct calls aren't paused)
async function similar(artist)
{
    await sleep(DELAY_MS);
    return getSimilarArtists(artist);
}

// Count how a list of candidates relates to what the user already knows
function classify(candidates, knownNames)
{
    const knownKeys = new Set(knownNames.map(normalizeArtist));
    const result = { layer1: [], layer2: [], fresh: [] };
    for (const c of candidates)
    {
        if (knownKeys.has(normalizeArtist(c))) result.layer1.push(c);
        else if (knownNames.some((k) => isSameArtist(k, c))) result.layer2.push(c);
        else result.fresh.push(c);
    }
    return result;
}

const mainSeed = (c) => c.because[0].source;

function countBy(list, key)
{
    const out = {};
    for (const x of list) out[key(x)] = (out[key(x)] ?? 0) + 1;
    return out;
}

function median(values)
{
    const s = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
    if (s.length === 0) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// The capped part of a list comes first: if every main seed has at least `cap`
// entries, the first (seeds × cap) entries hold exactly `cap` per seed.
function assertCappedHead(list, cap, limit, label)
{
    const counts = countBy(list, mainSeed);
    const seeds = Object.keys(counts);
    const headSize = seeds.length * cap;
    if (!seeds.every((s) => counts[s] >= cap) || headSize > limit) return;
    const head = countBy(list.slice(0, headSize), mainSeed);
    for (const s of seeds) assert.equal(head[s], cap, `${label}: ${s} has ${head[s]} in the capped part`);
}

const preview = (recs, n = 10) =>
    recs.slice(0, n).map((r) => `${r.name} (${r.listeners?.toLocaleString() ?? "?"})`).join(", ");


// ─────────────────────────────────────────────────────────────
// 1. Last.fm API, for real
// ─────────────────────────────────────────────────────────────
describe("Last.fm API (live)", () =>
{
    test("a well-known artist has info, listeners and similar artists", async (t) =>
    {
        if (!live(t)) return;
        const info = await lastfmGet("artist.getinfo", { artist: "Radiohead" });
        assert.equal(info.artist.name, "Radiohead");
        assert.ok(Number(info.artist.stats.listeners) > 1_000_000, "Radiohead should have > 1M listeners");

        const list = await similar("Radiohead");
        assert.ok(list.length >= 10, `only ${list.length} similar artists`);
        for (const s of list)
        {
            assert.equal(typeof s.name, "string");
            assert.ok(s.match >= 0 && s.match <= 1, `match out of range: ${s.match}`);
        }
    });

    test("an artist that doesn't exist → LastfmError code 6", async (t) =>
    {
        if (!live(t)) return;
        await sleep(DELAY_MS);
        await assert.rejects(
            getSimilarArtists("zzqq-no-such-artist-overture-e2e-4821"),
            (err) => err instanceof LastfmError && err.code === 6,
        );
    });

    test("names that break naive URLs come back as the right artist", async (t) =>
    {
        if (!live(t)) return;
        for (const artist of ["Simon & Garfunkel", "AC/DC", "Guns N' Roses", "Tyler, The Creator",
            "Florence + the Machine", "Ich + Ich", "Queen + Paul Rodgers", "nobodyknows+"]) // "+" needs the double escaping
        {
            await sleep(DELAY_MS);
            const info = await lastfmGet("artist.getinfo", { artist, autocorrect: 1 });
            assert.equal(normalizeArtist(info.artist.name), normalizeArtist(artist), `asked for "${artist}", got "${info.artist.name}"`);
        }
    });

    test("names in every script are found, and have similar artists", async (t) =>
    {
        if (!live(t)) return;
        const artists = {
            Cyrillic: "Татьяна Куртукова",
            Arabic: "محمد عساف",
            Greek: "Δημήτρης Μητροπάνος",
            Japanese: "宇多田ヒカル",
            Chinese: "周深",
            Korean: "아이유",
            Hebrew: "אריק איינשטיין",
            Accents: "Adèle Castillon",
        };
        // Any request error would throw here: that's the encoding check.
        // Some native-script pages are small duplicates with few neighbours,
        // so a couple of empty lists are reported, not failed.
        const empty = [];
        for (const [script, artist] of Object.entries(artists))
        {
            const list = await similar(artist);
            if (list.length === 0) empty.push(`${script} (${artist})`);
        }
        if (empty.length) t.diagnostic(`no similar artists for: ${empty.join(", ")}`);
        assert.ok(empty.length <= 2, `too many empty lists: ${empty.join(", ")}`);
    });

    test("match is relative: similar lists start at exactly 1", async (t) =>
    {
        if (!live(t)) return;
        // The scoring decision (relative match, seed weights do the work) relies on this
        const firsts = [];
        for (const artist of ["Radiohead", "Soolking", "Клава Кока", "Haris Alexiou", "Fairuz"])
        {
            const [top] = await similar(artist);
            if (top) firsts.push(top.match);
        }
        assert.ok(firsts.length >= 4, "too few similar lists to check");
        assert.ok(firsts.filter((m) => m === 1).length >= firsts.length - 1,
            `first matches: ${firsts.join(", ")} (expected nearly all to be 1)`);
    });

    test("listener counts: real numbers for well-known artists, in every script", async (t) =>
    {
        if (!live(t)) return;
        const names = ["Radiohead", "Клава Кока", "محمد عساف", "Χάρις Αλεξίου"];
        const counts = await getListenerCounts(names, DELAY_MS);
        for (const n of names) assert.ok(typeof counts[n] === "number" && counts[n] > 1000, `${n}: ${counts[n]}`);
        t.diagnostic(names.map((n) => `${n} ${counts[n].toLocaleString()}`).join(" · "));
    });
});


// ─────────────────────────────────────────────────────────────
// 2. Typed artists → seeds
// ─────────────────────────────────────────────────────────────
describe("Typed artists through the seeds adapter", () =>
{
    test("no artists at all → empty list, nothing to ask Last.fm", async () =>
    {
        assert.deepEqual(await loadSeeds([]), []);
    });

    test("only junk typed (spaces, empty lines) → empty list", async () =>
    {
        assert.deepEqual(await loadSeeds(["", "   ", "\n", "\t"]), []);
    });

    test("wrong input type is refused before any call", async () =>
    {
        await assert.rejects(loadSeeds("Radiohead"), TypeError);
        await assert.rejects(loadSeeds(null), TypeError);
    });

    test("Latin-only messy paste: cleaned, deduplicated, every artist found on Last.fm", async (t) =>
    {
        const seeds = await loadSeeds(["  Radiohead\n", "radiohead", "PORTISHEAD", "Massive Attack", "", "Björk", "Tyler, The Creator"]);
        assert.deepEqual(seeds.map((s) => s.name), ["Radiohead", "PORTISHEAD", "Massive Attack", "Björk", "Tyler, The Creator"]);
        assert.ok(seeds.every((s) => s.weight === 1));

        if (!live(t)) return;
        const { graph, skipped } = await buildSimilarityGraph(seeds, DELAY_MS);
        assert.deepEqual(skipped, [], `not found on Last.fm: ${skipped.join(", ")}`);
        assert.equal(graph.length, seeds.length);
    });

    test("mixed scripts: the same artist typed twice in two scripts", async () =>
    {
        // Layer 1 (seeds) keeps both, because the names differ...
        const seeds = await loadSeeds(["Клава Кока", "Klava Koka", "Δημήτρης Μητροπάνος", "Dimitris Mitropanos"]);
        assert.equal(seeds.length, 4);
        // ...but Layer 2 knows they are pairs (the ranking uses isSameArtist)
        assert.equal(isSameArtist(seeds[0].name, seeds[1].name), true);
        assert.equal(isSameArtist(seeds[2].name, seeds[3].name), true);
        assert.equal(isSameArtist(seeds[0].name, seeds[2].name), false);
    });
});


// ─────────────────────────────────────────────────────────────
// 3. "Already heard" on real Last.fm data
// ─────────────────────────────────────────────────────────────
describe("Already heard, on real data", () =>
{
    test("Latin-only user: every 'already heard' is caught by Layer 1", async (t) =>
    {
        if (!live(t)) return;
        const known = ["Radiohead", "Portishead", "Massive Attack", "Björk", "Thom Yorke", "Muse"];
        const candidates = (await similar("Radiohead")).map((s) => s.name);
        const { layer1, layer2 } = classify(candidates, known);
        assert.equal(layer2.length, 0, `Layer 2 should not fire on Latin-only names: ${layer2.join(", ")}`);
        t.diagnostic(`Radiohead → ${candidates.length} candidates, ${layer1.length} already known: ${layer1.join(", ")}`);
    });

    test("day-one bug: a Russian user who knows 'Klava Koka' (Latin, from Spotify)", async (t) =>
    {
        if (!live(t)) return;
        // Last.fm lists her in Cyrillic as similar to Татьяна Куртукова
        const candidates = (await similar("Татьяна Куртукова")).map((s) => s.name);
        if (!candidates.some((c) => normalizeArtist(c) === normalizeArtist("Клава Кока")))
        {
            t.skip(`live data changed: Клава Кока is no longer similar to Татьяна Куртукова (${candidates.slice(0, 5).join(", ")}…)`);
            return;
        }
        const { layer1, layer2 } = classify(candidates, ["Klava Koka", "MIA BOYKA", "Татьяна Куртукова"]);
        assert.ok(layer2.some((c) => normalizeArtist(c) === normalizeArtist("Клава Кока")),
            "Layer 2 should recognize Клава Кока as the known Klava Koka");
        t.diagnostic(`Layer 1 caught: ${layer1.join(", ") || "–"} · Layer 2 caught: ${layer2.join(", ")}`);
    });

    test("Last.fm duplicate page: محمد عساف is recommended to himself as 'Mohammad Assaf'", async (t) =>
    {
        if (!live(t)) return;
        const candidates = (await similar("محمد عساف")).map((s) => s.name);
        if (!candidates.some((c) => normalizeArtist(c) === normalizeArtist("Mohammad Assaf")))
        {
            t.skip(`live data changed: Mohammad Assaf no longer in the list (${candidates.slice(0, 5).join(", ")}…)`);
            return;
        }
        const { layer2 } = classify(candidates, ["محمد عساف"]);
        assert.ok(layer2.some((c) => normalizeArtist(c) === normalizeArtist("Mohammad Assaf")));
    });

    test("Greek user typing names in Greek: Latin-spelled candidates are matched", async (t) =>
    {
        if (!live(t)) return;
        const known = ["Χάρις Αλεξίου", "Δημήτρης Μητροπάνος", "Γιώργος Νταλάρας", "Βασίλης Παπακωνσταντίνου", "Μανώλης Μητσιάς"];
        const candidates = [];
        for (const artist of known.slice(0, 2)) candidates.push(...(await similar(artist)).map((s) => s.name));
        const { layer1, layer2, fresh } = classify(candidates, known);
        // No assertion on counts (live data), only on correctness of what Layer 2 matched
        for (const c of layer2) assert.ok(known.some((k) => isSameArtist(k, c)));
        t.diagnostic(`${candidates.length} candidates · Layer 1: ${layer1.length} · Layer 2: ${layer2.join(", ") || "–"} · new: ${fresh.length}`);
    });

    test("scripts outside Layer 2 (Chinese, Japanese): never wrongly flagged", async (t) =>
    {
        if (!live(t)) return;
        const known = ["Zhou Shen", "Utada Hikaru"];
        const candidates = [...(await similar("周深")), ...(await similar("宇多田ヒカル"))].map((s) => s.name);
        const { layer2 } = classify(candidates, known);
        assert.deepEqual(layer2, [], `Layer 2 matched unsupported scripts: ${layer2.join(", ")}`);
    });

    test("Layer 2 never merges two different artists from the same real lists", async (t) =>
    {
        if (!live(t)) return;
        // Every pair of names inside a few real similar lists: a merge here
        // means two names in one recommendation list were treated as one artist
        const merged = [];
        for (const artist of ["Клава Кока", "عمرو دياب", "Haris Alexiou", "Toše Proeski"])
        {
            const names = [artist, ...(await similar(artist)).map((s) => s.name)];
            for (let i = 0; i < names.length; i++)
                for (let j = i + 1; j < names.length; j++)
                    if (normalizeArtist(names[i]) !== normalizeArtist(names[j]) && isSameArtist(names[i], names[j]))
                        merged.push(`${names[i]} ↔ ${names[j]}`);
        }
        // Real duplicate pages can appear here; list them so a human can check
        t.diagnostic(merged.length ? `Layer 2 merges inside lists (check by hand): ${merged.join(" · ")}` : "no merges inside lists");
        assert.ok(merged.length <= 3, `suspiciously many merges: ${merged.join(" · ")}`);
    });
});


// ─────────────────────────────────────────────────────────────
// 4. The full pipeline, typed artists (live)
//    A multi-scene profile: Russian pop, Algerian rap, Greek, English rock
// ─────────────────────────────────────────────────────────────
describe("Full pipeline: typed artists → recommendations (live)", () =>
{
    const TYPED = ["Клава Кока", "Soolking", "Haris Alexiou", "Radiohead"];
    let seeds = null, graph = null, pool = null, listeners = null;
    let recsPopular = null, recsDeep = null;
    let firstRunMs = 0;

    test("similarity graph: one entry per typed artist, nothing skipped", async (t) =>
    {
        if (!live(t)) return;
        seeds = await loadSeeds(TYPED);
        const start = performance.now();
        const result = await buildSimilarityGraph(seeds, DELAY_MS);
        firstRunMs += performance.now() - start;

        assert.deepEqual(result.skipped, []);
        assert.deepEqual(result.graph.map((g) => g.source), TYPED);
        for (const g of result.graph)
        {
            assert.ok(g.similar.length > 0, `${g.source} has no similar artists`);
            assert.equal(g.weight, 1);
        }
        graph = result.graph;
    });

    test("pool: ≤ 40 candidates, none already known, no known collaborations, capped per seed", (t) =>
    {
        if (!needs(t, graph, "the graph")) return;
        pool = buildPool(graph, seeds);

        assert.ok(pool.length > 0 && pool.length <= 40, `pool size ${pool.length}`);
        for (const c of pool)
        {
            assert.ok(!seeds.some((s) => isSameArtist(c.name, s.name)), `${c.name} is a seed`);
            const parts = c.name.split(", ");
            if (parts.length >= 2) assert.ok(!parts.some((p) => seeds.some((s) => isSameArtist(p, s.name))), `${c.name} is a known collaboration`);
            assert.ok(TYPED.includes(mainSeed(c)), `main seed ${mainSeed(c)} is not a typed artist`);
            for (let i = 1; i < c.because.length; i++) assert.ok(c.because[i - 1].contribution >= c.because[i].contribution);
        }
        assertCappedHead(pool, 5, 40, "pool");
        t.diagnostic(`pool ${pool.length} · per main seed ${JSON.stringify(countBy(pool, mainSeed))}`);
    });

    test("listener counts for the whole pool, through the cache", async (t) =>
    {
        if (!needs(t, pool, "the pool")) return;
        const start = performance.now();
        listeners = await getListenerCounts(pool.map((c) => c.name), DELAY_MS);
        firstRunMs += performance.now() - start;

        assert.deepEqual(Object.keys(listeners).sort(), pool.map((c) => c.name).sort());
        const counted = Object.values(listeners).filter((n) => typeof n === "number").length;
        assert.ok(counted >= pool.length * 0.8, `only ${counted}/${pool.length} have a listener count`);
    });

    test("recommendations: final shape, ≤ 20, none already known, capped at 3 per seed", (t) =>
    {
        if (!needs(t, listeners, "listener counts")) return;
        recsPopular = rankPool(pool, listeners, 0);
        recsDeep = rankPool(pool, listeners, 0.5);

        for (const [label, recs] of [["popular", recsPopular], ["deep", recsDeep]])
        {
            assert.ok(recs.length > 0 && recs.length <= 20, `${label}: ${recs.length} recommendations`);
            for (const r of recs)
            {
                assert.deepEqual(Object.keys(r).sort(), ["because", "lastfmUrl", "listeners", "name", "score"]);
                assert.ok(r.score > 0 && Number.isFinite(r.score));
                assert.ok(r.because.length >= 1);
                assert.ok(!seeds.some((s) => isSameArtist(r.name, s.name)), `${label}: ${r.name} is already known`);
            }
            assertCappedHead(recs, 3, 20, label);
            assert.deepEqual(JSON.parse(JSON.stringify(recs)), recs, `${label}: not JSON-safe`);
        }
        t.diagnostic(`popular: ${preview(recsPopular)}`);
        t.diagnostic(`deep:    ${preview(recsDeep)}`);
    });

    test("'deep' recommends less-known artists than 'popular'", (t) =>
    {
        if (!needs(t, recsDeep, "recommendations")) return;
        const popular = median(recsPopular.map((r) => r.listeners));
        const deep = median(recsDeep.map((r) => r.listeners));
        t.diagnostic(`median listeners: popular ${popular?.toLocaleString()} · deep ${deep?.toLocaleString()}`);
        assert.ok(deep <= popular, `deep (${deep}) should not be more mainstream than popular (${popular})`);
    });

    test("second run is served from the cache: same result, much faster", async (t) =>
    {
        if (!needs(t, recsDeep, "a first run")) return;
        const start = performance.now();
        const { graph: graph2 } = await buildSimilarityGraph(seeds, DELAY_MS);
        const pool2 = buildPool(graph2, seeds);
        const listeners2 = await getListenerCounts(pool2.map((c) => c.name), DELAY_MS);
        const recs2 = rankPool(pool2, listeners2, 0.5);
        const secondRunMs = performance.now() - start;

        assert.deepEqual(recs2, recsDeep);
        t.diagnostic(`first run ${Math.round(firstRunMs)} ms · second run ${Math.round(secondRunMs)} ms`);
        assert.ok(secondRunMs < firstRunMs / 2, `second run (${Math.round(secondRunMs)} ms) not much faster than the first (${Math.round(firstRunMs)} ms)`);
    });

    test("an unknown typed artist is reported, the others still give recommendations", async (t) =>
    {
        if (!live(t)) return;
        const typed = await loadSeeds(["Radiohead", "zzqq-no-such-artist-overture-e2e-4821"]);
        const { graph: g, skipped } = await buildSimilarityGraph(typed, DELAY_MS);
        assert.deepEqual(skipped, ["zzqq-no-such-artist-overture-e2e-4821"]);
        const p = buildPool(g, typed);
        const recs = rankPool(p, await getListenerCounts(p.map((c) => c.name), DELAY_MS), 0.5);
        assert.ok(recs.length > 0);
    });
});


// ─────────────────────────────────────────────────────────────
// 5. Your real Spotify account (only with SPOTIFY_ACCESS_TOKEN)
// ─────────────────────────────────────────────────────────────
describe("Spotify → recommendations (live, optional)", () =>
{
    const token = process.env.SPOTIFY_ACCESS_TOKEN;
    const realTokens = () => ({ accessToken: token, refreshToken: "", expiresAt: Date.now() + 3_600_000 });

    // The adapter reads its token from chrome.storage: give it the real one
    before(() => { if (token) memory.set("spotifyTokens", realTokens()); });

    const spotify = (t) =>
    {
        if (!token) { t.skip("set SPOTIFY_ACCESS_TOKEN to run (see the top of this file)"); return false; }
        return true;
    };

    let artists = [];

    test("your real top artists: valid contract, harmonic weights", async (t) =>
    {
        if (!spotify(t)) return;
        artists = await loadSpotify();
        assert.ok(artists.length > 0, "no top artists returned");
        artists.forEach((a, rank) =>
        {
            assert.deepEqual(Object.keys(a).sort(), ["name", "weight"]);
            assert.ok(Math.abs(a.weight - 1 / (rank + 1)) < 1e-9, `weight of #${rank + 1} is ${a.weight}`);
        });
        assert.equal(normalizeArtistList(artists.map((a) => a.name)).length, artists.length, "duplicates in Spotify output");
        t.diagnostic(`${artists.length} artists: ${artists.slice(0, 8).map((a) => a.name).join(", ")}…`);
    });

    test("your recommendations: none already known, from your own seeds", async (t) =>
    {
        if (!spotify(t) || !live(t)) return;
        if (artists.length === 0) { t.skip("no Spotify artists"); return; }

        const { graph, skipped } = await buildSimilarityGraph(artists, DELAY_MS);
        assert.ok(skipped.length <= Math.ceil(artists.length * 0.2), `too many not on Last.fm: ${skipped.join(", ")}`);

        const pool = buildPool(graph, artists);
        const recs = rankPool(pool, await getListenerCounts(pool.map((c) => c.name), DELAY_MS), 0.5);
        assert.ok(recs.length > 0, "no recommendations");
        for (const r of recs)
        {
            assert.ok(!artists.some((a) => isSameArtist(r.name, a.name)), `${r.name} is already in your top artists`);
            assert.ok(artists.some((a) => a.name === r.because[0].source), `main reason ${r.because[0].source} is not one of your artists`);
        }
        t.diagnostic(`skipped: ${skipped.join(", ") || "–"}`);
        t.diagnostic(`your top 10: ${preview(recs)}`);
    });

    test("an expired or wrong token is reported as an error, not as 'no artists'", async (t) =>
    {
        if (!spotify(t)) return;
        memory.set("spotifyTokens", { accessToken: "invalid-token", refreshToken: "", expiresAt: Date.now() + 3_600_000 });
        try { await assert.rejects(loadSpotify(), /401/); }
        finally { memory.set("spotifyTokens", realTokens()); }
    });
});
