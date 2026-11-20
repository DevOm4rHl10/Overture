// Tests for extension/similarity.js
// Run from the repo root: node --test
// Offline: fetch and chrome.storage.local are replaced by fakes.
// The real lastfm.js, normalize.js and cache.js are used, so these tests also
// check that the pieces work together.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { getSimilarArtists, buildSimilarityGraph } from "../extension/similarity.js";
import { LastfmError } from "../extension/lastfm.js";
import { normalizeArtist } from "../extension/shared/normalize.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SIMILAR_LIMIT = 15;

// ---------------------------------------------------------------------------
// Fake Last.fm (through a fake fetch)
// ---------------------------------------------------------------------------

// What Last.fm sends back for an unknown artist / a rate limit.
// If the code-6 or code-29 tests fail but the rest pass, check how lastfmGet
// reads errors (HTTP status vs JSON body) and adjust these two helpers.
const lastfmError = (code, message) => ({ status: 200, body: { error: code, message } });
const UNKNOWN = lastfmError(6, "The artist you supplied could not be found");
const RATE_LIMIT = lastfmError(29, "Rate limit exceeded");

const ok = (body) => ({ status: 200, body });

// A normal artist.getsimilar response, as Last.fm sends it (match as strings)
function similarResponse(seed, entries) {
    return ok({
        similarartists: {
            artist: entries.map(([name, match, mbid = ""]) => ({
                name,
                match: String(match),
                url: "https://www.last.fm/music/" + encodeURIComponent(name),
                mbid
            })),
            "@attr": { artist: seed }
        }
    });
}

let fetchCalls;     // [{ url, method, artist, limit, autocorrect }]
let routes;         // artist name (as sent) → response, or a function
let previousFetch;

function installFakeFetch() {
    previousFetch = globalThis.fetch;
    fetchCalls = [];
    routes = new Map();

    globalThis.fetch = async (input) => {
        const url = new URL(typeof input === "string" ? input : input.url);
        const p = url.searchParams;
        const call = {
            url: url.toString(),
            method: p.get("method"),
            artist: p.get("artist"),
            limit: p.get("limit"),
            autocorrect: p.get("autocorrect")
        };
        fetchCalls.push(call);

        let route = routes.get(call.artist);
        if (typeof route === "function") route = route(call);
        if (route instanceof Error) throw route;
        if (route === undefined) route = similarResponse(call.artist, []);

        return new Response(JSON.stringify(route.body), {
            status: route.status,
            headers: { "Content-Type": "application/json" }
        });
    };
}

// ---------------------------------------------------------------------------
// Fake chrome.storage.local (values copied through JSON, like the real one)
// ---------------------------------------------------------------------------

let storage;
let previousChrome;

function installFakeStorage() {
    previousChrome = globalThis.chrome;
    const data = new Map();
    storage = {
        data,
        failGet: null,
        failSet: null,
        async get(key) {
            if (this.failGet) throw this.failGet;
            return data.has(key) ? { [key]: JSON.parse(data.get(key)) } : {};
        },
        async set(items) {
            if (this.failSet) throw this.failSet;
            for (const [k, v] of Object.entries(items)) data.set(k, JSON.stringify(v));
        },
        seed(key, entry) { data.set(key, JSON.stringify(entry)); },
        read(key) { return data.has(key) ? JSON.parse(data.get(key)) : undefined; }
    };
    globalThis.chrome = { storage: { local: storage } };
}

const cacheKey = (name) => "similar:" + normalizeArtist(name) + ":" + SIMILAR_LIMIT;

beforeEach(() => {
    installFakeFetch();
    installFakeStorage();
});

afterEach(() => {
    globalThis.fetch = previousFetch;
    globalThis.chrome = previousChrome;
});

// Default data used by several tests
function routeDefaults() {
    routes.set("BTS", similarResponse("BTS", [
        ["RM", 1, "0c33fb3f-50ab-4eba-adb4-7e4faa9bcc54"],
        ["Agust D", 0.970091],
        ["방탄소년단", 0.476684]
    ]));
    routes.set("Taylor Swift", similarResponse("Taylor Swift", [
        ["Sabrina Carpenter", 1],
        ["Gracie Abrams", 0.972838]
    ]));
    routes.set("Клава Кока", similarResponse("Клава Кока", [
        ["Люся Чеботина", 1],
        ["Zivert", 0.83]
    ]));
}

// ===========================================================================
// getSimilarArtists
// ===========================================================================

describe("getSimilarArtists: wrong inputs throw TypeError, no call", () => {

    for (const bad of [undefined, null, 42, {}, [], true]) {
        test(`artist ${JSON.stringify(bad) ?? String(bad)}`, async () => {
            await assert.rejects(getSimilarArtists(bad), TypeError);
            assert.equal(fetchCalls.length, 0);
        });
    }

    for (const bad of ["", "   ", "\t\n"]) {
        test(`empty artist ${JSON.stringify(bad)}`, async () => {
            await assert.rejects(getSimilarArtists(bad), TypeError);
            assert.equal(fetchCalls.length, 0);
        });
    }
});

describe("getSimilarArtists: request", () => {

    test("asks artist.getsimilar with limit 15 and autocorrect 1", async () => {
        routeDefaults();
        await getSimilarArtists("BTS");

        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].method, "artist.getsimilar");
        assert.equal(fetchCalls[0].artist, "BTS");
        assert.equal(fetchCalls[0].limit, "15");
        assert.equal(fetchCalls[0].autocorrect, "1");
    });

    test("sends the name trimmed", async () => {
        routeDefaults();
        await getSimilarArtists("  BTS  ");
        assert.equal(fetchCalls[0].artist, "BTS");
    });

    test("non-Latin names are sent unchanged", async () => {
        routeDefaults();
        const result = await getSimilarArtists("Клава Кока");
        assert.equal(fetchCalls[0].artist, "Клава Кока");
        assert.equal(result[0].name, "Люся Чеботина");
    });
});

describe("getSimilarArtists: response cleaning", () => {

    test("normal list → [{ name, match, url, mbid }] with match as a number", async () => {
        routeDefaults();
        const result = await getSimilarArtists("BTS");

        assert.equal(result.length, 3);
        assert.deepEqual(result[0], {
            name: "RM",
            match: 1,
            url: "https://www.last.fm/music/RM",
            mbid: "0c33fb3f-50ab-4eba-adb4-7e4faa9bcc54"
        });
        assert.equal(typeof result[1].match, "number");
        assert.equal(result[1].match, 0.970091);
    });

    test("keeps Last.fm's order", async () => {
        routeDefaults();
        const names = (await getSimilarArtists("BTS")).map(a => a.name);
        assert.deepEqual(names, ["RM", "Agust D", "방탄소년단"]);
    });

    test("empty mbid → null", async () => {
        routeDefaults();
        const result = await getSimilarArtists("BTS");
        assert.equal(result[1].mbid, null);
    });

    test("missing mbid and missing url → null", async () => {
        routes.set("X", ok({ similarartists: { artist: [{ name: "A", match: "0.5" }] } }));
        const [a] = await getSimilarArtists("X");
        assert.equal(a.url, null);
        assert.equal(a.mbid, null);
    });

    test("a single result sent as an object (not an array) → array of one", async () => {
        routes.set("X", ok({ similarartists: {
            artist: { name: "Only One", match: "1", url: "u", mbid: "" }
        } }));
        const result = await getSimilarArtists("X");
        assert.deepEqual(result, [{ name: "Only One", match: 1, url: "u", mbid: null }]);
    });

    test("match already a number is accepted", async () => {
        routes.set("X", ok({ similarartists: { artist: [{ name: "A", match: 0.25 }] } }));
        const [a] = await getSimilarArtists("X");
        assert.equal(a.match, 0.25);
    });

    test("match 0 and match 1 are kept (inclusive bounds)", async () => {
        routes.set("X", ok({ similarartists: { artist: [
            { name: "Zero", match: "0" },
            { name: "One", match: "1" }
        ] } }));
        const names = (await getSimilarArtists("X")).map(a => a.name);
        assert.deepEqual(names, ["Zero", "One"]);
    });

    test("names are trimmed", async () => {
        routes.set("X", ok({ similarartists: { artist: [{ name: "  Jul  ", match: "1" }] } }));
        const [a] = await getSimilarArtists("X");
        assert.equal(a.name, "Jul");
    });

    for (const [label, body] of Object.entries({
        "no similarartists": {},
        "similarartists null": { similarartists: null },
        "no artist field": { similarartists: { "@attr": { artist: "X" } } },
        "empty artist list": { similarartists: { artist: [] } }
    })) {
        test(`${label} → []`, async () => {
            routes.set("X", ok(body));
            assert.deepEqual(await getSimilarArtists("X"), []);
        });
    }

    test("bad entries are skipped, good ones kept", async () => {
        routes.set("X", ok({ similarartists: { artist: [
            null,
            { match: "0.9" },                       // no name
            { name: 123, match: "0.9" },            // name not a string
            { name: { a: 1 }, match: "0.9" },       // name not a string
            { name: "", match: "0.9" },             // empty name
            { name: "   ", match: "0.9" },          // blank name
            { name: "NoMatch" },                    // match missing
            { name: "EmptyMatch", match: "" },      // "" would become 0
            { name: "BlankMatch", match: "  " },    // "  " would become 0
            { name: "NullMatch", match: null },     // null would become 0
            { name: "BoolMatch", match: true },     // true would become 1
            { name: "TextMatch", match: "abc" },    // NaN
            { name: "TooHigh", match: "1.5" },
            { name: "Negative", match: "-0.1" },
            { name: "Infinite", match: "Infinity" },
            { name: "Good", match: "0.42" }
        ] } }));

        const result = await getSimilarArtists("X");
        assert.deepEqual(result.map(a => a.name), ["Good"]);
    });
});

describe("getSimilarArtists: errors", () => {

    test("unknown artist → LastfmError with code 6", async () => {
        routes.set("Nobody", UNKNOWN);
        await assert.rejects(getSimilarArtists("Nobody"),
            (e) => e instanceof LastfmError && e.code === 6);
    });

    test("rate limit → LastfmError with code 29", async () => {
        routes.set("X", RATE_LIMIT);
        await assert.rejects(getSimilarArtists("X"),
            (e) => e instanceof LastfmError && e.code === 29);
    });

    test("network failure → rejects", async () => {
        routes.set("X", new TypeError("fetch failed"));
        await assert.rejects(getSimilarArtists("X"));
    });

    test("getSimilarArtists does not use the cache", async () => {
        routeDefaults();
        await getSimilarArtists("BTS");
        await getSimilarArtists("BTS");
        assert.equal(fetchCalls.length, 2);
        assert.equal(storage.data.size, 0);
    });
});

// ===========================================================================
// buildSimilarityGraph
// ===========================================================================

describe("buildSimilarityGraph: wrong inputs throw TypeError, no call", () => {

    for (const bad of [undefined, null, "BTS", 42, {}, { name: "BTS", weight: 1 }]) {
        test(`sourceArtists ${JSON.stringify(bad) ?? String(bad)}`, async () => {
            await assert.rejects(buildSimilarityGraph(bad), TypeError);
            assert.equal(fetchCalls.length, 0);
        });
    }

    for (const bad of [null, "250", -1, NaN, Infinity, -Infinity, {}]) {
        test(`pauseMs ${typeof bad === "string" ? JSON.stringify(bad) : (JSON.stringify(bad) === "{}" ? "{}" : String(bad))}`, async () => {
            await assert.rejects(
                buildSimilarityGraph([{ name: "BTS", weight: 1 }], bad),
                TypeError
            );
            assert.equal(fetchCalls.length, 0);
        });
    }

    test("pauseMs undefined → default (0), no error", async () => {
        routeDefaults();
        await buildSimilarityGraph([{ name: "BTS", weight: 1 }], undefined);
        assert.equal(fetchCalls.length, 1);
    });
});

describe("buildSimilarityGraph: empty results, no call", () => {

    test("no artists → empty graph and skipped", async () => {
        assert.deepEqual(await buildSimilarityGraph([]), { graph: [], skipped: [] });
        assert.equal(fetchCalls.length, 0);
    });

    test("only weight-0 artists → empty graph and skipped", async () => {
        const result = await buildSimilarityGraph([
            { name: "Jimin", weight: 0 },
            { name: "V", weight: 0 }
        ]);
        assert.deepEqual(result, { graph: [], skipped: [] });
        assert.equal(fetchCalls.length, 0);
    });

    test("only bad entries → empty graph and skipped", async () => {
        const result = await buildSimilarityGraph([null, [], "BTS", { name: "" }]);
        assert.deepEqual(result, { graph: [], skipped: [] });
        assert.equal(fetchCalls.length, 0);
    });
});

describe("buildSimilarityGraph: graph shape", () => {

    test("one entry per seed: { source, weight, similar }", async () => {
        routeDefaults();
        const { graph, skipped } = await buildSimilarityGraph([{ name: "BTS", weight: 1 }]);

        assert.deepEqual(skipped, []);
        assert.equal(graph.length, 1);
        assert.deepEqual(Object.keys(graph[0]).sort(), ["similar", "source", "weight"]);
        assert.equal(graph[0].source, "BTS");
        assert.equal(graph[0].weight, 1);
        assert.deepEqual(graph[0].similar, await getSimilarArtists("BTS"));
    });

    test("keeps input order and each seed's own weight", async () => {
        routeDefaults();
        const { graph } = await buildSimilarityGraph([
            { name: "Taylor Swift", weight: 0.5 },
            { name: "BTS", weight: 1 },
            { name: "Клава Кока", weight: 1 / 3 }
        ]);
        assert.deepEqual(graph.map(g => [g.source, g.weight]), [
            ["Taylor Swift", 0.5],
            ["BTS", 1],
            ["Клава Кока", 1 / 3]
        ]);
    });

    test("source name is trimmed", async () => {
        routeDefaults();
        const { graph } = await buildSimilarityGraph([{ name: "  BTS ", weight: 1 }]);
        assert.equal(graph[0].source, "BTS");
        assert.equal(fetchCalls[0].artist, "BTS");
    });

    test("a known artist with no similar artists stays in graph with similar: []", async () => {
        routes.set("Lonely", similarResponse("Lonely", []));
        const { graph, skipped } = await buildSimilarityGraph([{ name: "Lonely", weight: 1 }]);
        assert.deepEqual(graph, [{ source: "Lonely", weight: 1, similar: [] }]);
        assert.deepEqual(skipped, []);
    });

    test("similar lists are not filtered (seed in its own list stays)", async () => {
        routes.set("BTS", similarResponse("BTS", [["BTS", 1], ["bts", 0.9], ["RM", 0.8]]));
        const { graph } = await buildSimilarityGraph([{ name: "BTS", weight: 1 }]);
        assert.deepEqual(graph[0].similar.map(a => a.name), ["BTS", "bts", "RM"]);
    });

    test("output survives a JSON round trip (Chrome messaging)", async () => {
        routeDefaults();
        routes.set("Nobody", UNKNOWN);
        const result = await buildSimilarityGraph([
            { name: "BTS", weight: 1 },
            { name: "Nobody", weight: 0.5 },
            { name: "Клава Кока", weight: 0.25 }
        ]);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    });

    test("50 artists → 50 calls, 50 graph entries", async () => {
        const input = Array.from({ length: 50 }, (_, i) => ({
            name: "Artist " + i,
            weight: 1 / (i + 1)
        }));
        const { graph } = await buildSimilarityGraph(input);
        assert.equal(fetchCalls.length, 50);
        assert.equal(graph.length, 50);
    });
});

describe("buildSimilarityGraph: entries that are skipped silently", () => {

    test("bad entries are skipped, valid ones still processed", async () => {
        routeDefaults();
        const { graph, skipped } = await buildSimilarityGraph([
            null,
            undefined,
            "BTS",
            ["BTS", 1],
            { weight: 1 },                     // no name
            { name: 42, weight: 1 },           // name not a string
            { name: "   ", weight: 1 },        // blank name
            { name: "X1" },                    // no weight
            { name: "X2", weight: "1" },       // weight not a number
            { name: "X3", weight: NaN },
            { name: "X4", weight: Infinity },
            { name: "X5", weight: -0.1 },      // below 0
            { name: "X6", weight: 1.5 },       // above 1
            { name: "BTS", weight: 1 }         // the only valid one
        ]);

        assert.deepEqual(graph.map(g => g.source), ["BTS"]);
        assert.deepEqual(skipped, []);
        assert.deepEqual(fetchCalls.map(c => c.artist), ["BTS"]);
    });

    test("weight 0: not queried, not in graph, not in skipped", async () => {
        routeDefaults();
        const { graph, skipped } = await buildSimilarityGraph([
            { name: "BTS", weight: 1 },
            { name: "Jimin", weight: 0 }
        ]);
        assert.deepEqual(graph.map(g => g.source), ["BTS"]);
        assert.deepEqual(skipped, []);
        assert.deepEqual(fetchCalls.map(c => c.artist), ["BTS"]);
    });

    test("weight 0 first does not block a later spelling of the same artist", async () => {
        routeDefaults();
        const { graph } = await buildSimilarityGraph([
            { name: "bts", weight: 0 },
            { name: "BTS", weight: 1 }
        ]);
        assert.deepEqual(graph.map(g => [g.source, g.weight]), [["BTS", 1]]);
    });
});

describe("buildSimilarityGraph: duplicate spellings", () => {

    test("asked once, first spelling kept with its weight", async () => {
        routeDefaults();
        const { graph } = await buildSimilarityGraph([
            { name: "BTS", weight: 1 },
            { name: "bts", weight: 0.5 },
            { name: "  BTS  ", weight: 0.25 }
        ]);
        assert.equal(fetchCalls.length, 1);
        assert.deepEqual(graph.map(g => [g.source, g.weight]), [["BTS", 1]]);
    });

    test("unknown artist sent twice → in skipped once, asked once", async () => {
        routes.set("Nobody", UNKNOWN);
        const { skipped } = await buildSimilarityGraph([
            { name: "Nobody", weight: 1 },
            { name: "nobody", weight: 0.5 }
        ]);
        assert.deepEqual(skipped, ["Nobody"]);
        assert.equal(fetchCalls.length, 1);
    });
});

describe("buildSimilarityGraph: unknown artists (code 6)", () => {

    test("one unknown among real ones → in skipped, the others still work", async () => {
        routeDefaults();
        routes.set("Скаттл", UNKNOWN);
        const { graph, skipped } = await buildSimilarityGraph([
            { name: "BTS", weight: 1 },
            { name: "Скаттл", weight: 0.5 },
            { name: "Taylor Swift", weight: 1 / 3 }
        ]);
        assert.deepEqual(graph.map(g => g.source), ["BTS", "Taylor Swift"]);
        assert.deepEqual(skipped, ["Скаттл"]);
        assert.equal(fetchCalls.length, 3);
    });

    test("every artist unknown → empty graph, all in skipped (trimmed, input order)", async () => {
        routes.set("A", UNKNOWN);
        routes.set("B", UNKNOWN);
        const { graph, skipped } = await buildSimilarityGraph([
            { name: " A ", weight: 1 },
            { name: "B", weight: 0.5 }
        ]);
        assert.deepEqual(graph, []);
        assert.deepEqual(skipped, ["A", "B"]);
    });
});

describe("buildSimilarityGraph: other errors stop everything", () => {

    test("rate limit (29) in the middle → rejects, later artists not asked", async () => {
        routeDefaults();
        routes.set("Taylor Swift", RATE_LIMIT);
        await assert.rejects(
            buildSimilarityGraph([
                { name: "BTS", weight: 1 },
                { name: "Taylor Swift", weight: 0.5 },
                { name: "Клава Кока", weight: 0.25 }
            ]),
            (e) => e instanceof LastfmError && e.code === 29
        );
        assert.deepEqual(fetchCalls.map(c => c.artist), ["BTS", "Taylor Swift"]);
    });

    test("network error in the middle → rejects", async () => {
        routeDefaults();
        routes.set("Taylor Swift", new TypeError("fetch failed"));
        await assert.rejects(buildSimilarityGraph([
            { name: "BTS", weight: 1 },
            { name: "Taylor Swift", weight: 0.5 }
        ]));
    });

    test("errors are not cached", async () => {
        routes.set("X", RATE_LIMIT);
        await assert.rejects(buildSimilarityGraph([{ name: "X", weight: 1 }]));
        assert.equal(storage.read(cacheKey("X")), undefined);
    });
});

// ===========================================================================
// buildSimilarityGraph + cache
// ===========================================================================

describe("buildSimilarityGraph: cache", () => {

    test("first run stores each result under similar:<normalized>:15", async (t) => {
        routeDefaults();
        t.mock.method(Date, "now", () => 1_000_000);
        await buildSimilarityGraph([{ name: "BTS", weight: 1 }]);

        const entry = storage.read(cacheKey("BTS"));
        assert.ok(entry, "entry stored under " + cacheKey("BTS"));
        assert.equal(entry.expiresAt, 1_000_000 + ONE_DAY_MS);
        assert.deepEqual(entry.value, await getSimilarArtists("BTS"));
    });

    test("second run: no network call, same result", async () => {
        routeDefaults();
        const input = [
            { name: "BTS", weight: 1 },
            { name: "Taylor Swift", weight: 0.5 },
            { name: "Клава Кока", weight: 0.25 }
        ];
        const first = await buildSimilarityGraph(input);
        const callsAfterFirst = fetchCalls.length;

        const second = await buildSimilarityGraph(input);
        assert.equal(fetchCalls.length, callsAfterFirst);
        assert.deepEqual(second, first);
    });

    test("cache is shared across spellings (normalized key)", async () => {
        routeDefaults();
        await buildSimilarityGraph([{ name: "BTS", weight: 1 }]);
        const { graph } = await buildSimilarityGraph([{ name: "bts", weight: 1 }]);
        assert.equal(fetchCalls.length, 1);
        assert.equal(graph[0].source, "bts");     // source is this run's spelling
    });

    test("weight comes from this run, not from the cache", async () => {
        routeDefaults();
        await buildSimilarityGraph([{ name: "BTS", weight: 1 }]);
        const { graph } = await buildSimilarityGraph([{ name: "BTS", weight: 0.2 }]);
        assert.equal(graph[0].weight, 0.2);
    });

    test("cached [] is a hit (no call)", async () => {
        storage.seed(cacheKey("Lonely"), { value: [], expiresAt: Date.now() + ONE_DAY_MS });
        const { graph } = await buildSimilarityGraph([{ name: "Lonely", weight: 1 }]);
        assert.equal(fetchCalls.length, 0);
        assert.deepEqual(graph, [{ source: "Lonely", weight: 1, similar: [] }]);
    });

    test("expired entry → asks Last.fm again and refreshes the entry", async () => {
        routeDefaults();
        storage.seed(cacheKey("BTS"), { value: [{ name: "Old" }], expiresAt: Date.now() - 1 });
        const { graph } = await buildSimilarityGraph([{ name: "BTS", weight: 1 }]);

        assert.equal(fetchCalls.length, 1);
        assert.equal(graph[0].similar[0].name, "RM");
        assert.equal(storage.read(cacheKey("BTS")).value[0].name, "RM");
    });

    for (const [label, entry] of Object.entries({
        "not an object": "garbage",
        "missing expiresAt": { value: [] },
        "value is a string": { value: "RM", expiresAt: Date.now() + ONE_DAY_MS },
        "value is an object": { value: { name: "RM" }, expiresAt: Date.now() + ONE_DAY_MS }
    })) {
        test(`broken entry (${label}) → miss, asks Last.fm, overwrites`, async () => {
            routeDefaults();
            storage.seed(cacheKey("BTS"), entry);
            const { graph } = await buildSimilarityGraph([{ name: "BTS", weight: 1 }]);

            assert.equal(fetchCalls.length, 1);
            assert.ok(Array.isArray(graph[0].similar));
            assert.ok(Array.isArray(storage.read(cacheKey("BTS")).value));
        });
    }

    test("unknown artists (code 6) are not cached: asked again next run", async () => {
        routes.set("Nobody", UNKNOWN);
        await buildSimilarityGraph([{ name: "Nobody", weight: 1 }]);
        assert.equal(storage.read(cacheKey("Nobody")), undefined);

        const { skipped } = await buildSimilarityGraph([{ name: "Nobody", weight: 1 }]);
        assert.equal(fetchCalls.length, 2);
        assert.deepEqual(skipped, ["Nobody"]);
    });

    test("weight-0 artists are not cached", async () => {
        await buildSimilarityGraph([{ name: "Jimin", weight: 0 }]);
        assert.equal(storage.data.size, 0);
    });
});

describe("buildSimilarityGraph: cache failures", () => {

    test("storage read fails → warning, falls back to Last.fm, result is complete", async (t) => {
        routeDefaults();
        const warn = t.mock.method(console, "warn", () => {});
        storage.failGet = new Error("storage unavailable");

        const { graph } = await buildSimilarityGraph([
            { name: "BTS", weight: 1 },
            { name: "Taylor Swift", weight: 0.5 }
        ]);
        assert.deepEqual(graph.map(g => g.source), ["BTS", "Taylor Swift"]);
        assert.equal(fetchCalls.length, 2);
        assert.ok(warn.mock.callCount() >= 1);
    });

    test("storage write fails → warning, result is complete", async (t) => {
        routeDefaults();
        const warn = t.mock.method(console, "warn", () => {});
        storage.failSet = new Error("QUOTA_BYTES quota exceeded");

        const { graph } = await buildSimilarityGraph([{ name: "BTS", weight: 1 }]);
        assert.equal(graph.length, 1);
        assert.equal(graph[0].similar[0].name, "RM");
        assert.ok(warn.mock.callCount() >= 1);
    });

    test("TypeError from storage read is not hidden: the run stops", async () => {
        routeDefaults();
        storage.failGet = new TypeError("Cannot read properties of undefined");
        await assert.rejects(buildSimilarityGraph([{ name: "BTS", weight: 1 }]), TypeError);
        assert.equal(fetchCalls.length, 0);
    });

    test("TypeError from storage write is not hidden: the run stops", async () => {
        routeDefaults();
        storage.failSet = new TypeError("Cannot read properties of undefined");
        await assert.rejects(buildSimilarityGraph([{ name: "BTS", weight: 1 }]), TypeError);
    });
});

// ===========================================================================
// buildSimilarityGraph: pause
// ===========================================================================

describe("buildSimilarityGraph: pause between network calls", () => {

    test("pauseMs 0 (default): three calls finish quickly", async () => {
        routeDefaults();
        const start = performance.now();
        await buildSimilarityGraph([
            { name: "BTS", weight: 1 },
            { name: "Taylor Swift", weight: 0.5 },
            { name: "Клава Кока", weight: 0.25 }
        ]);
        assert.ok(performance.now() - start < 100);
    });

    test("pauseMs 60: waits between network calls (2 pauses for 3 calls)", async () => {
        routeDefaults();
        const start = performance.now();
        await buildSimilarityGraph([
            { name: "BTS", weight: 1 },
            { name: "Taylor Swift", weight: 0.5 },
            { name: "Клава Кока", weight: 0.25 }
        ], 60);
        const elapsed = performance.now() - start;
        assert.ok(elapsed >= 110, `expected ≥ ~120 ms, got ${Math.round(elapsed)} ms`);
    });

    test("no pause before the first call", async () => {
        routeDefaults();
        const start = performance.now();
        await buildSimilarityGraph([{ name: "BTS", weight: 1 }], 500);
        assert.ok(performance.now() - start < 200);
    });

    test("no pause on cache hits", async () => {
        routeDefaults();
        const input = [
            { name: "BTS", weight: 1 },
            { name: "Taylor Swift", weight: 0.5 },
            { name: "Клава Кока", weight: 0.25 }
        ];
        await buildSimilarityGraph(input);           // fill the cache, no pause

        const start = performance.now();
        await buildSimilarityGraph(input, 500);
        assert.ok(performance.now() - start < 200);
        assert.equal(fetchCalls.length, 3);
    });

    test("no pause for skipped entries (weight 0, bad, duplicates)", async () => {
        routeDefaults();
        const start = performance.now();
        await buildSimilarityGraph([
            { name: "BTS", weight: 1 },
            { name: "Jimin", weight: 0 },
            null,
            { name: "bts", weight: 0.5 }
        ], 500);
        assert.ok(performance.now() - start < 200);
    });
});