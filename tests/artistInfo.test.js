// Tests for extension/artistInfo.js
// Run from the repo root: node --test
// Offline: fetch and chrome.storage.local are replaced by fakes.
// The real lastfm.js, normalize.js and cache.js are used, so these tests also
// check that the pieces work together.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { getArtistInfo, getListenerCounts } from "../extension/artistInfo.js";
import { LastfmError } from "../extension/lastfm.js";
import { normalizeArtist } from "../extension/shared/normalize.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Fake Last.fm (through a fake fetch)
// ---------------------------------------------------------------------------

const ok = (body) => ({ status: 200, body });
const lastfmError = (code, message) => ({ status: 200, body: { error: code, message } });
const UNKNOWN = lastfmError(6, "The artist you supplied could not be found");
const RATE_LIMIT = lastfmError(29, "Rate limit exceeded");

// A normal artist.getinfo response (listeners as a string, like Last.fm)
function infoResponse(name, listeners, extra = {}) {
    return ok({
        artist: {
            name,
            url: "https://www.last.fm/music/" + encodeURIComponent(name),
            stats: { listeners: String(listeners), playcount: "123456" },
            ...extra
        }
    });
}

let fetchCalls;
let routes;
let previousFetch;

function installFakeFetch() {
    previousFetch = globalThis.fetch;
    fetchCalls = [];
    routes = new Map();

    globalThis.fetch = async (input) => {
        const url = new URL(typeof input === "string" ? input : input.url);
        const p = url.searchParams;
        const call = {
            method: p.get("method"),
            artist: p.get("artist"),
            autocorrect: p.get("autocorrect")
        };
        fetchCalls.push(call);

        let route = routes.get(call.artist);
        if (typeof route === "function") route = route(call);
        if (route instanceof Error) throw route;
        if (route === undefined) route = infoResponse(call.artist, 1000);

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

const cacheKey = (name) => "info:" + normalizeArtist(name);
const fresh = (value) => ({ value, expiresAt: Date.now() + ONE_DAY_MS });

beforeEach(() => {
    installFakeFetch();
    installFakeStorage();
});

afterEach(() => {
    globalThis.fetch = previousFetch;
    globalThis.chrome = previousChrome;
});

// ===========================================================================
// getArtistInfo
// ===========================================================================

describe("getArtistInfo: wrong inputs throw TypeError, no call", () => {

    for (const bad of [undefined, null, 42, {}, [], true, "", "   ", "\t\n"]) {
        test(`name ${JSON.stringify(bad) ?? String(bad)}`, async () => {
            await assert.rejects(getArtistInfo(bad), TypeError);
            assert.equal(fetchCalls.length, 0);
        });
    }
});

describe("getArtistInfo: request", () => {

    test("asks artist.getinfo with autocorrect 1", async () => {
        await getArtistInfo("Zivert");
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].method, "artist.getinfo");
        assert.equal(fetchCalls[0].artist, "Zivert");
        assert.equal(fetchCalls[0].autocorrect, "1");
    });

    test("sends the name trimmed", async () => {
        await getArtistInfo("  Zivert  ");
        assert.equal(fetchCalls[0].artist, "Zivert");
    });

    test("non-Latin names are sent unchanged", async () => {
        await getArtistInfo("Люся Чеботина");
        await getArtistInfo("عمرو الدريني");
        assert.deepEqual(fetchCalls.map(c => c.artist), ["Люся Чеботина", "عمرو الدريني"]);
    });

    test("getArtistInfo does not use the cache", async () => {
        await getArtistInfo("Zivert");
        await getArtistInfo("Zivert");
        assert.equal(fetchCalls.length, 2);
        assert.equal(storage.data.size, 0);
    });
});

describe("getArtistInfo: response cleaning", () => {

    test("returns { listeners, url } with listeners as a number", async () => {
        routes.set("Zivert", infoResponse("Zivert", 77596));
        const info = await getArtistInfo("Zivert");
        assert.deepEqual(info, {
            listeners: 77596,
            url: "https://www.last.fm/music/Zivert"
        });
        assert.equal(typeof info.listeners, "number");
    });

    test("returns exactly the keys listeners and url (no playcount, no name)", async () => {
        const info = await getArtistInfo("Zivert");
        assert.deepEqual(Object.keys(info).sort(), ["listeners", "url"]);
    });

    test("listeners \"0\" → 0 (a real count, not null)", async () => {
        routes.set("Empty Page", infoResponse("Empty Page", 0));
        assert.equal((await getArtistInfo("Empty Page")).listeners, 0);
    });

    test("large counts are kept exactly", async () => {
        routes.set("Big", infoResponse("Big", 5123456));
        assert.equal((await getArtistInfo("Big")).listeners, 5123456);
    });

    for (const [label, raw] of Object.entries({
        "empty string": "",
        "blank string": "   ",
        "not a number": "abc",
        "negative": "-5",
        "Infinity": "Infinity",
        "NaN": "NaN"
    })) {
        test(`listeners ${label} → null`, async () => {
            routes.set("X", ok({ artist: { name: "X", url: "u", stats: { listeners: raw } } }));
            assert.equal((await getArtistInfo("X")).listeners, null);
        });
    }

    for (const [label, body] of Object.entries({
        "empty body": {},
        "artist null": { artist: null },
        "no stats": { artist: { name: "X", url: "u" } },
        "stats null": { artist: { name: "X", url: "u", stats: null } },
        "no listeners": { artist: { name: "X", url: "u", stats: { playcount: "5" } } },
        "listeners null": { artist: { name: "X", url: "u", stats: { listeners: null } } }
    })) {
        test(`${label} → listeners null, no crash`, async () => {
            routes.set("X", ok(body));
            const info = await getArtistInfo("X");
            assert.equal(info.listeners, null);
        });
    }

    test("missing url → null", async () => {
        routes.set("X", ok({ artist: { name: "X", stats: { listeners: "10" } } }));
        assert.equal((await getArtistInfo("X")).url, null);
    });

    test("empty url → null", async () => {
        routes.set("X", ok({ artist: { name: "X", url: "", stats: { listeners: "10" } } }));
        assert.equal((await getArtistInfo("X")).url, null);
    });

    test("result survives a JSON round trip", async () => {
        const info = await getArtistInfo("Zivert");
        assert.deepEqual(JSON.parse(JSON.stringify(info)), info);
    });
});

describe("getArtistInfo: errors are passed to the caller", () => {

    test("unknown artist → LastfmError with code 6", async () => {
        routes.set("Nobody", UNKNOWN);
        await assert.rejects(getArtistInfo("Nobody"),
            (e) => e instanceof LastfmError && e.code === 6);
    });

    test("rate limit → LastfmError with code 29", async () => {
        routes.set("X", RATE_LIMIT);
        await assert.rejects(getArtistInfo("X"),
            (e) => e instanceof LastfmError && e.code === 29);
    });

    test("network failure → rejects", async () => {
        routes.set("X", new TypeError("fetch failed"));
        await assert.rejects(getArtistInfo("X"));
    });
});

// ===========================================================================
// getListenerCounts
// ===========================================================================

describe("getListenerCounts: wrong inputs throw TypeError, no call", () => {

    for (const bad of [undefined, null, "Zivert", 42, {}, { 0: "Zivert", length: 1 }]) {
        test(`names ${JSON.stringify(bad) ?? String(bad)}`, async () => {
            await assert.rejects(getListenerCounts(bad), TypeError);
            assert.equal(fetchCalls.length, 0);
        });
    }

    for (const bad of [null, "0", -1, NaN, Infinity, -Infinity, {}, []]) {
        test(`pauseMs ${typeof bad === "string" ? JSON.stringify(bad) : String(bad)}`, async () => {
            await assert.rejects(getListenerCounts(["Zivert"], bad), TypeError);
            assert.equal(fetchCalls.length, 0);
        });
    }

    test("pauseMs undefined → default (0), no error", async () => {
        const result = await getListenerCounts(["Zivert"], undefined);
        assert.equal(result["Zivert"], 1000);
    });
});

describe("getListenerCounts: results", () => {

    test("empty list → empty object, no call", async () => {
        assert.deepEqual(await getListenerCounts([]), {});
        assert.equal(fetchCalls.length, 0);
    });

    test("one entry per name, value = listeners", async () => {
        routes.set("Zivert", infoResponse("Zivert", 77596));
        routes.set("Seryabkina", infoResponse("Seryabkina", 2728));
        const result = await getListenerCounts(["Zivert", "Seryabkina"]);
        assert.deepEqual(result, { "Zivert": 77596, "Seryabkina": 2728 });
    });

    test("keys are the names exactly as given (not trimmed, not normalized)", async () => {
        const result = await getListenerCounts(["  Zivert ", "ZIVERT"]);
        assert.deepEqual(Object.keys(result).sort(), ["  Zivert ", "ZIVERT"]);
    });

    test("non-Latin names work as keys", async () => {
        routes.set("Люся Чеботина", infoResponse("Люся Чеботина", 26051));
        routes.set("عمرو الدريني", infoResponse("عمرو الدريني", 2637));
        const result = await getListenerCounts(["Люся Чеботина", "عمرو الدريني"]);
        assert.equal(result["Люся Чеботина"], 26051);
        assert.equal(result["عمرو الدريني"], 2637);
    });

    test("bad names are skipped, valid ones still answered", async () => {
        const result = await getListenerCounts([null, 42, "", "   ", {}, ["Zivert"], "Zivert"]);
        assert.deepEqual(Object.keys(result), ["Zivert"]);
        assert.deepEqual(fetchCalls.map(c => c.artist), ["Zivert"]);
    });

    test("known page without a count → null", async () => {
        routes.set("X", ok({ artist: { name: "X", url: "u", stats: {} } }));
        assert.deepEqual(await getListenerCounts(["X"]), { X: null });
    });

    test("result survives a JSON round trip (Chrome messaging)", async () => {
        routes.set("Nobody", UNKNOWN);
        const result = await getListenerCounts(["Zivert", "Nobody", "Люся Чеботина"]);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    });

    test("40 names → 40 calls on a cold cache", async () => {
        const names = Array.from({ length: 40 }, (_, i) => "Artist " + i);
        const result = await getListenerCounts(names);
        assert.equal(fetchCalls.length, 40);
        assert.equal(Object.keys(result).length, 40);
    });
});

describe("getListenerCounts: unknown artists (code 6)", () => {

    test("unknown → null, the others still work", async () => {
        routes.set("Nobody", UNKNOWN);
        routes.set("Zivert", infoResponse("Zivert", 77596));
        const result = await getListenerCounts(["Nobody", "Zivert"]);
        assert.deepEqual(result, { Nobody: null, Zivert: 77596 });
    });

    test("unknown artists are not cached: asked again next run", async () => {
        routes.set("Nobody", UNKNOWN);
        await getListenerCounts(["Nobody"]);
        assert.equal(storage.read(cacheKey("Nobody")), undefined);
        await getListenerCounts(["Nobody"]);
        assert.equal(fetchCalls.length, 2);
    });
});

describe("getListenerCounts: other errors stop everything", () => {

    test("rate limit (29) in the middle → rejects, later names not asked", async () => {
        routes.set("B", RATE_LIMIT);
        await assert.rejects(getListenerCounts(["A", "B", "C"]),
            (e) => e instanceof LastfmError && e.code === 29);
        assert.deepEqual(fetchCalls.map(c => c.artist), ["A", "B"]);
    });

    test("network error in the middle → rejects", async () => {
        routes.set("B", new TypeError("fetch failed"));
        await assert.rejects(getListenerCounts(["A", "B"]));
    });

    test("errors are not cached", async () => {
        routes.set("X", RATE_LIMIT);
        await assert.rejects(getListenerCounts(["X"]));
        assert.equal(storage.read(cacheKey("X")), undefined);
    });
});

describe("getListenerCounts: cache", () => {

    test("stores { listeners, url } under info:<normalized> for one day", async (t) => {
        routes.set("Zivert", infoResponse("Zivert", 77596));
        t.mock.method(Date, "now", () => 1_000_000);
        await getListenerCounts(["Zivert"]);

        assert.deepEqual(storage.read(cacheKey("Zivert")), {
            value: { listeners: 77596, url: "https://www.last.fm/music/Zivert" },
            expiresAt: 1_000_000 + ONE_DAY_MS
        });
    });

    test("second run: no network call, same result", async () => {
        const names = ["Zivert", "Seryabkina", "Люся Чеботина"];
        const first = await getListenerCounts(names);
        const callsAfterFirst = fetchCalls.length;
        const second = await getListenerCounts(names);
        assert.equal(fetchCalls.length, callsAfterFirst);
        assert.deepEqual(second, first);
    });

    test("cache is shared across spellings (normalized key)", async () => {
        await getListenerCounts(["Zivert"]);
        const result = await getListenerCounts(["  ZIVERT "]);
        assert.equal(fetchCalls.length, 1);
        assert.equal(result["  ZIVERT "], 1000);
    });

    test("two spellings in the same call → asked once", async () => {
        const result = await getListenerCounts(["Zivert", "zivert"]);
        assert.equal(fetchCalls.length, 1);
        assert.deepEqual(result, { Zivert: 1000, zivert: 1000 });
    });

    test("a known page without a count is cached, and { listeners: null } is a hit", async () => {
        routes.set("X", ok({ artist: { name: "X", url: "u", stats: {} } }));
        await getListenerCounts(["X"]);
        assert.deepEqual(storage.read(cacheKey("X")).value, { listeners: null, url: "u" });

        const result = await getListenerCounts(["X"]);
        assert.equal(fetchCalls.length, 1);
        assert.deepEqual(result, { X: null });
    });

    test("cached listeners 0 is a hit", async () => {
        storage.seed(cacheKey("Empty"), fresh({ listeners: 0, url: null }));
        assert.deepEqual(await getListenerCounts(["Empty"]), { Empty: 0 });
        assert.equal(fetchCalls.length, 0);
    });

    test("expired entry → asks Last.fm again and refreshes the entry", async () => {
        routes.set("Zivert", infoResponse("Zivert", 80000));
        storage.seed(cacheKey("Zivert"), { value: { listeners: 1, url: null }, expiresAt: Date.now() - 1 });
        const result = await getListenerCounts(["Zivert"]);
        assert.equal(fetchCalls.length, 1);
        assert.equal(result["Zivert"], 80000);
        assert.equal(storage.read(cacheKey("Zivert")).value.listeners, 80000);
    });

    for (const [label, value] of Object.entries({
        "a number instead of an object": 77596,
        "a string": "77596",
        "an object without listeners": { url: "u" },
        "listeners as a string": { listeners: "77596", url: "u" },
        "negative listeners": { listeners: -1, url: "u" },
        "listeners as a boolean": { listeners: true, url: "u" }
    })) {
        test(`broken entry (${label}) → miss, asks Last.fm, overwrites`, async () => {
            routes.set("Zivert", infoResponse("Zivert", 77596));
            storage.seed(cacheKey("Zivert"), fresh(value));
            const result = await getListenerCounts(["Zivert"]);
            assert.equal(fetchCalls.length, 1);
            assert.equal(result["Zivert"], 77596);
            assert.equal(storage.read(cacheKey("Zivert")).value.listeners, 77596);
        });
    }

    test("an array cached value → miss", async () => {
        storage.seed(cacheKey("Zivert"), fresh([1, 2]));
        await getListenerCounts(["Zivert"]);
        assert.equal(fetchCalls.length, 1);
    });

    test("getListenerCounts does not touch the similarity cache keys", async () => {
        storage.seed("similar:zivert:15", fresh([{ name: "X" }]));
        await getListenerCounts(["Zivert"]);
        assert.deepEqual(storage.read("similar:zivert:15").value, [{ name: "X" }]);
    });
});

describe("getListenerCounts: cache failures", () => {

    test("storage read fails → warning, falls back to Last.fm, result is complete", async (t) => {
        const warn = t.mock.method(console, "warn", () => {});
        storage.failGet = new Error("storage unavailable");
        const result = await getListenerCounts(["A", "B"]);
        assert.deepEqual(Object.keys(result), ["A", "B"]);
        assert.equal(fetchCalls.length, 2);
        assert.ok(warn.mock.callCount() >= 1);
    });

    test("storage write fails → warning, result is complete", async (t) => {
        const warn = t.mock.method(console, "warn", () => {});
        storage.failSet = new Error("QUOTA_BYTES quota exceeded");
        routes.set("Zivert", infoResponse("Zivert", 77596));
        const result = await getListenerCounts(["Zivert"]);
        assert.deepEqual(result, { Zivert: 77596 });
        assert.ok(warn.mock.callCount() >= 1);
    });

    test("TypeError from storage read is not hidden: the run stops", async () => {
        storage.failGet = new TypeError("Cannot read properties of undefined");
        await assert.rejects(getListenerCounts(["Zivert"]), TypeError);
        assert.equal(fetchCalls.length, 0);
    });

    test("TypeError from storage write is not hidden: the run stops", async () => {
        storage.failSet = new TypeError("Cannot read properties of undefined");
        await assert.rejects(getListenerCounts(["Zivert"]), TypeError);
    });
});

describe("getListenerCounts: pause between network calls", () => {

    test("pauseMs 0 (default): three calls finish quickly", async () => {
        const start = performance.now();
        await getListenerCounts(["A", "B", "C"]);
        assert.ok(performance.now() - start < 100);
    });

    test("pauseMs 60: waits between network calls (2 pauses for 3 calls)", async () => {
        const start = performance.now();
        await getListenerCounts(["A", "B", "C"], 60);
        const elapsed = performance.now() - start;
        assert.ok(elapsed >= 110, `expected ≥ ~120 ms, got ${Math.round(elapsed)} ms`);
    });

    test("no pause before the first call", async () => {
        const start = performance.now();
        await getListenerCounts(["A"], 500);
        assert.ok(performance.now() - start < 200);
    });

    test("no pause on cache hits", async () => {
        await getListenerCounts(["A", "B", "C"]);
        const start = performance.now();
        await getListenerCounts(["A", "B", "C"], 500);
        assert.ok(performance.now() - start < 200);
        assert.equal(fetchCalls.length, 3);
    });

    test("no pause for skipped names", async () => {
        const start = performance.now();
        await getListenerCounts(["A", null, "", 42], 500);
        assert.ok(performance.now() - start < 200);
    });

    test("an unknown artist (code 6) still counts as a network call for the pause", async () => {
        routes.set("Nobody", UNKNOWN);
        const start = performance.now();
        await getListenerCounts(["Nobody", "A"], 60);
        assert.ok(performance.now() - start >= 50);
    });
});