// ─────────────────────────────────────────────────────────────────────────────
// End-to-end test: the pipeline so far, against the REAL Last.fm API
// (and optionally your real Spotify account).
//
//   input (typed artists or Spotify) → seeds / Spotify adapter → cleaning
//   → real Last.fm calls through lastfmGet → name matching (Layer 1 + Layer 2)
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
// Live data changes: if Last.fm stops returning an artist a test relies on,
// that test is SKIPPED with an explanation instead of failing.
//
// When Phase 4 exists, replace the small helper getSimilar() below with your
// real similarity function, so this test checks your code instead of mine.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test, before } from "node:test";
import assert from "node:assert/strict";

import { lastfmGet, LastfmError } from "../../extension/lastfm.js";
import { LASTFM_API_KEY } from "../../extension/config.js";
import { normalizeArtist, normalizeArtistList } from "../../extension/shared/normalize.js";
import { isSameArtist } from "../../extension/shared/transliterate.js";
import { loadArtists as loadSeeds } from "../../extension/sources/seeds.js";
import { loadArtists as loadSpotify } from "../../extension/sources/spotify.js";


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

// Test-only helper (Phase 4 will provide the real one): similar artists of one artist
async function getSimilar(artist, limit = 15)
{
    await sleep(DELAY_MS);
    const body = await lastfmGet("artist.getsimilar", { artist, limit, autocorrect: 1 });
    const list = body?.similarartists?.artist;
    const items = Array.isArray(list) ? list : list ? [list] : [];
    return items.map((s) => ({ name: s.name, match: Number(s.match) }));
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

        const similar = await getSimilar("Radiohead");
        assert.ok(similar.length >= 10, `only ${similar.length} similar artists`);
        for (const s of similar)
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
            lastfmGet("artist.getsimilar", { artist: "zzqq-no-such-artist-overture-e2e-4821", autocorrect: 1 }),
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
            const similar = await getSimilar(artist);
            if (similar.length === 0) empty.push(`${script} (${artist})`);
        }
        if (empty.length) t.diagnostic(`no similar artists for: ${empty.join(", ")}`);
        assert.ok(empty.length <= 2, `too many empty lists: ${empty.join(", ")}`);
    });

    test("match is relative: similar lists start at exactly 1", async (t) =>
    {
        if (!live(t)) return;
        // The Phase 5 decision (option A) relies on this
        const firsts = [];
        for (const artist of ["Radiohead", "Soolking", "Клава Кока", "Haris Alexiou", "Fairuz"])
        {
            const [top] = await getSimilar(artist, 5);
            if (top) firsts.push(top.match);
        }
        assert.ok(firsts.length >= 4, "too few similar lists to check");
        assert.ok(firsts.filter((m) => m === 1).length >= firsts.length - 1,
            `first matches: ${firsts.join(", ")} (expected nearly all to be 1)`);
    });
});


// ─────────────────────────────────────────────────────────────
// 2. Typed artists → seeds → Last.fm
// ─────────────────────────────────────────────────────────────
describe("Typed artists through the pipeline", () =>
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
        const notFound = [];
        for (const { name } of seeds)
        {
            try { await getSimilar(name, 5); }
            catch (err) { if (err instanceof LastfmError && err.code === 6) notFound.push(name); else throw err; }
        }
        assert.deepEqual(notFound, [], `not found on Last.fm: ${notFound.join(", ")}`);
    });

    test("mixed scripts: the same artist typed twice in two scripts", async () =>
    {
        // Layer 1 (seeds) keeps both, because the names differ...
        const seeds = await loadSeeds(["Клава Кока", "Klava Koka", "Δημήτρης Μητροπάνος", "Dimitris Mitropanos"]);
        assert.equal(seeds.length, 4);
        // ...but Layer 2 knows they are pairs. Phase 5 must use isSameArtist when it matters.
        assert.equal(isSameArtist(seeds[0].name, seeds[1].name), true);
        assert.equal(isSameArtist(seeds[2].name, seeds[3].name), true);
        assert.equal(isSameArtist(seeds[0].name, seeds[2].name), false);
    });

    test("one unknown artist among real ones: it is reported, the others still work", async (t) =>
    {
        if (!live(t)) return;
        const seeds = await loadSeeds(["Radiohead", "zzqq-no-such-artist-overture-e2e-4821", "Portishead"]);
        const found = [], skipped = [];
        for (const { name } of seeds)
        {
            try { found.push({ name, similar: await getSimilar(name, 5) }); }
            catch (err) { if (err instanceof LastfmError && err.code === 6) skipped.push(name); else throw err; }
        }
        assert.deepEqual(skipped, ["zzqq-no-such-artist-overture-e2e-4821"]);
        assert.deepEqual(found.map((f) => f.name), ["Radiohead", "Portishead"]);
        assert.ok(found.every((f) => f.similar.length > 0));
    });
});


// ─────────────────────────────────────────────────────────────
// 3. "Already heard" on real Last.fm data (what Phase 5 will need)
// ─────────────────────────────────────────────────────────────
describe("Already heard, on real data", () =>
{
    test("Latin-only user: every 'already heard' is caught by Layer 1", async (t) =>
    {
        if (!live(t)) return;
        const known = ["Radiohead", "Portishead", "Massive Attack", "Björk", "Thom Yorke", "Muse"];
        const candidates = (await getSimilar("Radiohead")).map((s) => s.name);
        const { layer1, layer2 } = classify(candidates, known);
        assert.equal(layer2.length, 0, `Layer 2 should not fire on Latin-only names: ${layer2.join(", ")}`);
        t.diagnostic(`Radiohead → ${candidates.length} candidates, ${layer1.length} already known: ${layer1.join(", ")}`);
    });

    test("day-one bug: a Russian user who knows 'Klava Koka' (Latin, from Spotify)", async (t) =>
    {
        if (!live(t)) return;
        // Last.fm lists her in Cyrillic as similar to Татьяна Куртукова
        const candidates = (await getSimilar("Татьяна Куртукова")).map((s) => s.name);
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
        const candidates = (await getSimilar("محمد عساف")).map((s) => s.name);
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
        for (const artist of known.slice(0, 2)) candidates.push(...(await getSimilar(artist)).map((s) => s.name));
        const { layer1, layer2, fresh } = classify(candidates, known);
        // No assertion on counts (live data), only on correctness of what Layer 2 matched
        for (const c of layer2) assert.ok(known.some((k) => isSameArtist(k, c)));
        t.diagnostic(`${candidates.length} candidates · Layer 1: ${layer1.length} · Layer 2: ${layer2.join(", ") || "–"} · new: ${fresh.length}`);
    });

    test("scripts outside Layer 2 (Chinese, Japanese): never wrongly flagged", async (t) =>
    {
        if (!live(t)) return;
        const known = ["Zhou Shen", "Utada Hikaru"];
        const candidates = [...(await getSimilar("周深")), ...(await getSimilar("宇多田ヒカル"))].map((s) => s.name);
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
            const names = [artist, ...(await getSimilar(artist)).map((s) => s.name)];
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
// 4. Your real Spotify account (only with SPOTIFY_ACCESS_TOKEN)
// ─────────────────────────────────────────────────────────────
describe("Spotify → Last.fm (live, optional)", () =>
{
    const token = process.env.SPOTIFY_ACCESS_TOKEN;

    // The adapter reads its token from chrome.storage: give it the real one
    before(() =>
    {
        if (!token) return;
        globalThis.chrome = {
            storage: {
                local: {
                    get: async (key) => ({ [key]: { accessToken: token, refreshToken: "", expiresAt: Date.now() + 3_600_000 } }),
                    set: async () => {},
                    remove: async () => {},
                },
            },
        };
    });

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

    test("every Spotify artist is found on Last.fm (or reported)", async (t) =>
    {
        if (!spotify(t) || !live(t)) return;
        if (artists.length === 0) { t.skip("previous test returned no artists"); return; }
        const notFound = [];
        for (const { name } of artists)
        {
            try { await getSimilar(name, 1); }
            catch (err) { if (err instanceof LastfmError && err.code === 6) notFound.push(name); else throw err; }
        }
        t.diagnostic(notFound.length ? `not on Last.fm: ${notFound.join(", ")}` : "all found");
        assert.ok(notFound.length <= Math.ceil(artists.length * 0.2), `too many not found: ${notFound.join(", ")}`);
    });

    test("your recommendations so far: how many are already heard (Layer 1 vs Layer 2)", async (t) =>
    {
        if (!spotify(t) || !live(t)) return;
        if (artists.length === 0) { t.skip("no Spotify artists"); return; }
        const known = artists.map((a) => a.name);
        const candidates = [];
        for (const { name } of artists.slice(0, 5))
        {
            try { candidates.push(...(await getSimilar(name)).map((s) => s.name)); }
            catch (err) { if (!(err instanceof LastfmError && err.code === 6)) throw err; }
        }
        const { layer1, layer2, fresh } = classify(candidates, known);
        t.diagnostic(`${candidates.length} candidates from your top 5 · already heard: ${layer1.length} (Layer 1) + ${layer2.length} (Layer 2: ${layer2.join(", ") || "–"}) · new: ${fresh.length}`);
        assert.ok(fresh.length > 0, "every candidate was already heard?");
    });

    test("an expired or wrong token is reported as an error, not as 'no artists'", async (t) =>
    {
        if (!spotify(t)) return;
        const saved = globalThis.chrome.storage.local.get;
        globalThis.chrome.storage.local.get = async (key) => ({ [key]: { accessToken: "invalid-token", refreshToken: "", expiresAt: Date.now() + 3_600_000 } });
        try { await assert.rejects(loadSpotify(), /401/); }
        finally { globalThis.chrome.storage.local.get = saved; }
    });
});