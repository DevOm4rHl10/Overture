// Tests for extension/sources/spotify.js (the Spotify data source adapter)
// Run from the repo root: node --test
//
// No network and no browser: Chrome's storage is replaced by a fake that
// always holds a valid token, and fetch is replaced by a fake Spotify API.
//
// Agreed behavior:
//   loadArtists(options?) → Promise<[{ name, weight }]>
//   - one request: GET /v1/me/top/artists?time_range=<timeRange>&limit=50
//   - options.timeRange: "short_term" | "medium_term" | "long_term"
//     (default "medium_term"); anything else → TypeError, no request
//   - weight = 1 / (rank + 1), rank starting at 0, so #1 = 1, #2 = 0.5, #3 = 1/3…
//   - rank is the position AFTER cleaning (invalid entries and duplicates
//     removed), so there are no gaps in the weights
//   - duplicates (by normalizeArtist) keep the first, higher-ranked spelling
//   - Spotify errors (not logged in, HTTP errors) are passed on, not swallowed
//
// Assumptions you can change (tell Claude and the tests will follow):
//   - limit 50 in a single request (Spotify's maximum per page)
//   - a response with no "items" array is treated as "no artists" → []

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { loadArtists } from "../extension/sources/spotify.js";


// ─────────────────────────────────────────────────────────────
// Fakes: Chrome storage with a valid token, and the Spotify API
// ─────────────────────────────────────────────────────────────

const VALID_TOKENS = {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: Date.now() + 60 * 60 * 1000,   // valid for one more hour
};

let storedTokens;

beforeEach(() =>
{
    storedTokens = { ...VALID_TOKENS };
    globalThis.chrome = {
        storage: {
            local: {
                get: async (key) => (storedTokens ? { [key]: storedTokens } : {}),
                set: async (obj) => { storedTokens = Object.values(obj)[0]; },
                remove: async () => { storedTokens = undefined; },
            },
        },
        identity: { getRedirectURL: () => "https://test.chromiumapp.org/" },
    };
});

afterEach(() =>
{
    delete globalThis.chrome;
});

// Replace fetch for one test. `respond` receives the URL and returns a Response.
function fakeSpotify(t, respond)
{
    return t.mock.method(globalThis, "fetch", async (url) => respond(new URL(String(url))));
}

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Build a Spotify "top artists" page from a list of names
const topArtists = (names) => json({
    items: names.map((name, i) => ({ id: `id${i}`, name, type: "artist", genres: [], uri: `spotify:artist:id${i}` })),
    total: names.length,
    limit: 50,
    offset: 0,
    next: null,
});

// Compare weights with a tiny tolerance (1/3 is not exact in floating point)
function assertArtists(actual, expected)
{
    assert.equal(actual.length, expected.length, `expected ${expected.length} artists, got ${actual.length}`);
    expected.forEach(({ name, weight }, i) =>
    {
        assert.equal(actual[i].name, name, `wrong name at position ${i}`);
        assert.ok(Math.abs(actual[i].weight - weight) < 1e-9, `wrong weight for "${name}": ${actual[i].weight}, expected ${weight}`);
    });
}


// ─────────────────────────────────────────────────────────────
// 1. The request
// ─────────────────────────────────────────────────────────────
describe("Request", () =>
{
    test("asks for top artists, medium_term by default, 50 at a time", async (t) =>
    {
        let seen;
        fakeSpotify(t, (url) => { seen = url; return topArtists(["Radiohead"]); });

        await loadArtists();

        assert.equal(seen.origin, "https://api.spotify.com");
        assert.equal(seen.pathname, "/v1/me/top/artists");
        assert.equal(seen.searchParams.get("time_range"), "medium_term");
        assert.equal(seen.searchParams.get("limit"), "50");
    });

    test("an empty options object also uses medium_term", async (t) =>
    {
        let seen;
        fakeSpotify(t, (url) => { seen = url; return topArtists([]); });
        await loadArtists({});
        assert.equal(seen.searchParams.get("time_range"), "medium_term");
    });

    for (const timeRange of ["short_term", "medium_term", "long_term"])
    {
        test(`timeRange "${timeRange}" is passed to Spotify`, async (t) =>
        {
            let seen;
            fakeSpotify(t, (url) => { seen = url; return topArtists([]); });
            await loadArtists({ timeRange });
            assert.equal(seen.searchParams.get("time_range"), timeRange);
        });
    }

    test("makes exactly one request, with the access token", async (t) =>
    {
        const fetchMock = fakeSpotify(t, () => topArtists(["Radiohead"]));
        await loadArtists();
        assert.equal(fetchMock.mock.callCount(), 1);
        const options = fetchMock.mock.calls[0].arguments[1];
        assert.equal(options?.headers?.Authorization, "Bearer test-access-token");
    });
});


// ─────────────────────────────────────────────────────────────
// 2. Harmonic weights: 1 / (rank + 1)
// ─────────────────────────────────────────────────────────────
describe("Harmonic weights", () =>
{
    test("#1 = 1, #2 = 1/2, #3 = 1/3, #4 = 1/4", async (t) =>
    {
        fakeSpotify(t, () => topArtists(["Radiohead", "Portishead", "Massive Attack", "Björk"]));
        assertArtists(await loadArtists(), [
            { name: "Radiohead", weight: 1 },
            { name: "Portishead", weight: 1 / 2 },
            { name: "Massive Attack", weight: 1 / 3 },
            { name: "Björk", weight: 1 / 4 },
        ]);
    });

    test("keeps Spotify's order", async (t) =>
    {
        const names = ["Z", "A", "M", "B"];
        fakeSpotify(t, () => topArtists(names));
        const result = await loadArtists();
        assert.deepEqual(result.map((a) => a.name), names);
    });

    test("a single artist gets weight 1", async (t) =>
    {
        fakeSpotify(t, () => topArtists(["Radiohead"]));
        assertArtists(await loadArtists(), [{ name: "Radiohead", weight: 1 }]);
    });

    test("a full page of 50: weights from 1 down to 1/50, strictly decreasing", async (t) =>
    {
        const names = Array.from({ length: 50 }, (_, i) => `Artist ${i + 1}`);
        fakeSpotify(t, () => topArtists(names));
        const result = await loadArtists();

        assert.equal(result.length, 50);
        assert.equal(result[0].weight, 1);
        assert.ok(Math.abs(result[49].weight - 1 / 50) < 1e-9);
        for (let i = 1; i < result.length; i++)
        {
            assert.ok(result[i].weight < result[i - 1].weight, `weight did not decrease at position ${i}`);
        }
    });

    test("the top weight is always exactly 1 (max = 1, same scale as seeds)", async (t) =>
    {
        fakeSpotify(t, () => topArtists(["A", "B", "C"]));
        const result = await loadArtists();
        assert.equal(Math.max(...result.map((a) => a.weight)), 1);
    });
});


// ─────────────────────────────────────────────────────────────
// 3. Cleaning: duplicates and bad entries
// ─────────────────────────────────────────────────────────────
describe("Cleaning", () =>
{
    test("duplicate artists keep the first (higher-ranked) spelling, no gap in ranks", async (t) =>
    {
        fakeSpotify(t, () => topArtists(["Radiohead", "Portishead", "RADIOHEAD", "Björk"]));
        assertArtists(await loadArtists(), [
            { name: "Radiohead", weight: 1 },
            { name: "Portishead", weight: 1 / 2 },
            { name: "Björk", weight: 1 / 3 },
        ]);
    });

    test("entries with no usable name are skipped, no gap in ranks", async (t) =>
    {
        fakeSpotify(t, () => json({
            items: [
                { name: "Radiohead" },
                { name: "" },
                { name: "   " },
                { name: null },
                {},
                null,
                { name: 42 },
                { name: "Portishead" },
            ],
        }));
        assertArtists(await loadArtists(), [
            { name: "Radiohead", weight: 1 },
            { name: "Portishead", weight: 1 / 2 },
        ]);
    });

    test("names are trimmed but otherwise kept as Spotify spells them", async (t) =>
    {
        fakeSpotify(t, () => topArtists(["  Tyler, The Creator ", "فيروز", "Кино", "宇多田ヒカル", "$uicideboy$"]));
        const result = await loadArtists();
        assert.deepEqual(result.map((a) => a.name), ["Tyler, The Creator", "فيروز", "Кино", "宇多田ヒカル", "$uicideboy$"]);
    });
});


// ─────────────────────────────────────────────────────────────
// 4. Empty and unusual responses
// ─────────────────────────────────────────────────────────────
describe("Empty and unusual responses", () =>
{
    test("a new Spotify account with no top artists → []", async (t) =>
    {
        fakeSpotify(t, () => topArtists([]));
        assert.deepEqual(await loadArtists(), []);
    });

    test("a response without an items array → []", async (t) =>
    {
        fakeSpotify(t, () => json({ total: 0 }));
        assert.deepEqual(await loadArtists(), []);
    });

    test("items that is not an array → []", async (t) =>
    {
        fakeSpotify(t, () => json({ items: "nope" }));
        assert.deepEqual(await loadArtists(), []);
    });

    test("extra fields from Spotify are not copied into the output", async (t) =>
    {
        fakeSpotify(t, () => json({
            items: [{ name: "Radiohead", id: "x", genres: ["art rock"], images: [], popularity: 80 }],
        }));
        const [first] = await loadArtists();
        assert.deepEqual(Object.keys(first).sort(), ["name", "weight"]);
    });
});


// ─────────────────────────────────────────────────────────────
// 5. Errors are passed on, never swallowed
// ─────────────────────────────────────────────────────────────
describe("Errors", () =>
{
    test("not logged in → rejects with NOT_LOGGED_IN, no request made", async (t) =>
    {
        storedTokens = undefined;
        const fetchMock = fakeSpotify(t, () => topArtists(["Radiohead"]));
        await assert.rejects(loadArtists(), /NOT_LOGGED_IN/);
        assert.equal(fetchMock.mock.callCount(), 0);
    });

    test("user not in the app's allowed list (403) → rejects", async (t) =>
    {
        fakeSpotify(t, () => json({ error: { status: 403, message: "User not registered in the Developer Dashboard" } }, 403));
        await assert.rejects(loadArtists(), /403/);
    });

    test("rate limited (429) → rejects", async (t) =>
    {
        fakeSpotify(t, () => json({ error: { status: 429, message: "API rate limit exceeded" } }, 429));
        await assert.rejects(loadArtists(), /429/);
    });

    test("network failure → rejects", async (t) =>
    {
        fakeSpotify(t, () => { throw new TypeError("fetch failed"); });
        await assert.rejects(loadArtists());
    });

    test("errors are never turned into an empty list", async (t) =>
    {
        fakeSpotify(t, () => json({ error: { status: 500, message: "Server error" } }, 500));
        let resolved = false;
        try { await loadArtists(); resolved = true; }
        catch { /* expected */ }
        assert.equal(resolved, false, "a Spotify error resolved as if the user had no artists");
    });
});


// ─────────────────────────────────────────────────────────────
// 6. Wrong options: refuse, don't run
// ─────────────────────────────────────────────────────────────
describe("Wrong options are refused", () =>
{
    test("an unknown timeRange → TypeError, no request", async (t) =>
    {
        const fetchMock = fakeSpotify(t, () => topArtists([]));
        for (const timeRange of ["medium", "MEDIUM_TERM", "", "6month", 42, null])
        {
            await assert.rejects(loadArtists({ timeRange }), TypeError, `accepted timeRange ${JSON.stringify(timeRange)}`);
        }
        assert.equal(fetchMock.mock.callCount(), 0);
    });

    test("options that are not an object → TypeError, no request", async (t) =>
    {
        const fetchMock = fakeSpotify(t, () => topArtists([]));
        for (const bad of [null, "medium_term", 42, ["medium_term"]])
        {
            await assert.rejects(loadArtists(bad), TypeError, `accepted options ${JSON.stringify(bad)}`);
        }
        assert.equal(fetchMock.mock.callCount(), 0);
    });
});


// ─────────────────────────────────────────────────────────────
// 7. The data contract
// ─────────────────────────────────────────────────────────────
describe("Contract", () =>
{
    test("returns a Promise", (t) =>
    {
        fakeSpotify(t, () => topArtists([]));
        const result = loadArtists();
        assert.ok(result instanceof Promise);
        return result;
    });

    test("every entry is { name: string, weight: finite number in (0, 1] }", async (t) =>
    {
        fakeSpotify(t, () => topArtists(["A", "B", "C", "D", "E"]));
        for (const entry of await loadArtists())
        {
            assert.deepEqual(Object.keys(entry).sort(), ["name", "weight"]);
            assert.equal(typeof entry.name, "string");
            assert.ok(Number.isFinite(entry.weight));
            assert.ok(entry.weight > 0 && entry.weight <= 1);
        }
    });

    test("output survives Chrome messaging (JSON round trip)", async (t) =>
    {
        fakeSpotify(t, () => topArtists(["Radiohead", "فيروز", "Кино"]));
        const result = await loadArtists();
        assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    });
});