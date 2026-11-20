// Tests for extension/cache.js
// Run from the repo root: node --test
// Offline: chrome.storage.local is replaced by an in-memory fake.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { cacheGet, cacheSet } from "../extension/cache.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Fake chrome.storage.local
// Values are copied through JSON, like the real storage does, so a test can't
// pass by accident because it shares an object reference with the cache.
// ---------------------------------------------------------------------------

function makeFakeStorage() {
    const data = new Map();
    const calls = { get: 0, set: 0 };

    return {
        data,
        calls,
        failGet: null,   // set to an Error to make get() reject
        failSet: null,   // set to an Error to make set() reject

        async get(key) {
            calls.get++;
            if (this.failGet) throw this.failGet;
            if (!data.has(key)) return {};
            return { [key]: JSON.parse(data.get(key)) };
        },

        async set(items) {
            calls.set++;
            if (this.failSet) throw this.failSet;
            for (const [k, v] of Object.entries(items)) {
                data.set(k, JSON.stringify(v));
            }
        },

        // Test helper: write a raw entry, bypassing cacheSet
        seed(key, entry) {
            data.set(key, JSON.stringify(entry));
        },

        read(key) {
            return data.has(key) ? JSON.parse(data.get(key)) : undefined;
        }
    };
}

let storage;
let previousChrome;

beforeEach(() => {
    previousChrome = globalThis.chrome;
    storage = makeFakeStorage();
    globalThis.chrome = { storage: { local: storage } };
});

afterEach(() => {
    globalThis.chrome = previousChrome;
});

// ---------------------------------------------------------------------------
// cacheSet: input validation
// ---------------------------------------------------------------------------

describe("cacheSet: wrong inputs throw TypeError and store nothing", () => {

    const badKeys = [undefined, null, 42, {}, [], "", "   "];
    for (const key of badKeys) {
        test(`key ${JSON.stringify(key) ?? String(key)}`, async () => {
            await assert.rejects(cacheSet(key, [1], 1000), TypeError);
            assert.equal(storage.calls.set, 0);
        });
    }

    const badTtls = [undefined, null, "1000", NaN, Infinity, -Infinity, 0, -1];
    for (const ttl of badTtls) {
        test(`ttlMs ${typeof ttl === "string" ? JSON.stringify(ttl) : String(ttl)}`, async () => {
            await assert.rejects(cacheSet("k", [1], ttl), TypeError);
            assert.equal(storage.calls.set, 0);
        });
    }

    for (const value of [null, undefined]) {
        test(`value ${String(value)}`, async () => {
            await assert.rejects(cacheSet("k", value, 1000), TypeError);
            assert.equal(storage.calls.set, 0);
        });
    }
});

// ---------------------------------------------------------------------------
// cacheSet: what gets stored
// ---------------------------------------------------------------------------

describe("cacheSet: stored entry", () => {

    test("stores { value, expiresAt } under the key", async (t) => {
        t.mock.method(Date, "now", () => 1_000_000);
        await cacheSet("similar:bts:15", [{ name: "RM" }], ONE_DAY_MS);

        assert.deepEqual(storage.read("similar:bts:15"), {
            value: [{ name: "RM" }],
            expiresAt: 1_000_000 + ONE_DAY_MS
        });
    });

    test("overwrites an existing entry", async () => {
        await cacheSet("k", ["old"], 1000);
        await cacheSet("k", ["new"], 1000);
        assert.deepEqual(await cacheGet("k"), ["new"]);
    });

    test("storage failure is passed to the caller (cacheSet doesn't swallow it)", async () => {
        storage.failSet = new Error("QUOTA_BYTES quota exceeded");
        await assert.rejects(cacheSet("k", [1], 1000), /quota/);
    });
});

// ---------------------------------------------------------------------------
// cacheGet: input validation
// ---------------------------------------------------------------------------

describe("cacheGet: wrong inputs throw TypeError and read nothing", () => {

    // null matters most: chrome.storage.local.get(null) returns EVERYTHING
    const badKeys = [undefined, null, 42, {}, [], "", "   "];
    for (const key of badKeys) {
        test(`key ${JSON.stringify(key) ?? String(key)}`, async () => {
            await assert.rejects(cacheGet(key), TypeError);
            assert.equal(storage.calls.get, 0);
        });
    }
});

// ---------------------------------------------------------------------------
// cacheGet: hits, misses, expiry
// ---------------------------------------------------------------------------

describe("cacheGet: hits and misses", () => {

    test("missing key → null", async () => {
        assert.equal(await cacheGet("nothing-here"), null);
    });

    test("round trip: array", async () => {
        const similar = [{ name: "Jul", match: 0.92, url: null, mbid: null }];
        await cacheSet("k", similar, ONE_DAY_MS);
        assert.deepEqual(await cacheGet("k"), similar);
    });

    test("round trip: empty array is a hit, not a miss", async () => {
        await cacheSet("k", [], ONE_DAY_MS);
        assert.deepEqual(await cacheGet("k"), []);
    });

    test("round trip: object, string, number, false", async () => {
        for (const value of [{ a: 1 }, "text", 0, false]) {
            await cacheSet("k", value, ONE_DAY_MS);
            assert.deepEqual(await cacheGet("k"), value);
        }
    });

    test("non-Latin keys work", async () => {
        await cacheSet("similar:клава кока:15", ["x"], ONE_DAY_MS);
        assert.deepEqual(await cacheGet("similar:клава кока:15"), ["x"]);
    });

    test("keys are separate", async () => {
        await cacheSet("a", ["A"], ONE_DAY_MS);
        await cacheSet("b", ["B"], ONE_DAY_MS);
        assert.deepEqual(await cacheGet("a"), ["A"]);
        assert.deepEqual(await cacheGet("b"), ["B"]);
    });
});

describe("cacheGet: expiry", () => {

    test("still valid 1 ms before expiresAt", async (t) => {
        const now = t.mock.method(Date, "now", () => 5_000);
        await cacheSet("k", ["x"], 1000);           // expiresAt = 6000
        now.mock.mockImplementation(() => 5_999);
        assert.deepEqual(await cacheGet("k"), ["x"]);
    });

    test("expired exactly at expiresAt → null", async (t) => {
        const now = t.mock.method(Date, "now", () => 5_000);
        await cacheSet("k", ["x"], 1000);
        now.mock.mockImplementation(() => 6_000);
        assert.equal(await cacheGet("k"), null);
    });

    test("expired after a day → null", async (t) => {
        const now = t.mock.method(Date, "now", () => 0);
        await cacheSet("k", ["x"], ONE_DAY_MS);
        now.mock.mockImplementation(() => ONE_DAY_MS + 1);
        assert.equal(await cacheGet("k"), null);
    });
});

// ---------------------------------------------------------------------------
// cacheGet: broken entries are misses, never crashes
// ---------------------------------------------------------------------------

describe("cacheGet: broken entries → null", () => {

    const future = () => Date.now() + ONE_DAY_MS;

    const broken = {
        "a string": () => "not an entry",
        "a number": () => 42,
        "an array": () => [1, 2, 3],
        "missing expiresAt": () => ({ value: ["x"] }),
        "expiresAt as string": () => ({ value: ["x"], expiresAt: String(future()) }),
        "expiresAt null (Infinity after JSON)": () => ({ value: ["x"], expiresAt: null }),
        "missing value": () => ({ expiresAt: future() }),
        "value null": () => ({ value: null, expiresAt: future() })
    };

    for (const [label, make] of Object.entries(broken)) {
        test(label, async () => {
            storage.seed("k", make());
            assert.equal(await cacheGet("k"), null);
        });
    }

    test("storage failure is passed to the caller (cacheGet doesn't swallow it)", async () => {
        storage.failGet = new Error("storage unavailable");
        await assert.rejects(cacheGet("k"), /unavailable/);
    });
});