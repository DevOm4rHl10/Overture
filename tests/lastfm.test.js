// Tests for extension/lastfm.js (the Last.fm API wrapper)
// Run from the repo root: node --test
//
// No network is used: every test replaces fetch with a fake one, so these
// run offline, don't need a valid API key and never hit Last.fm's limits.
//
// Agreed interface:
//   lastfmGet(method, params) → Promise<parsed JSON body>
//   Failures throw a LastfmError with:
//     .code = Last.fm's numeric code (6, 10, 29…) for errors Last.fm reports
//           = "NETWORK"      when fetch itself fails
//           = "BAD_RESPONSE" when the body isn't usable JSON (or a non-OK
//                            status comes with no Last.fm error in the body)
//   Wrong argument types (programming errors) throw a plain TypeError,
//   like normalize.js, and no request is made.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { lastfmGet, LastfmError } from "../extension/lastfm.js";
import { LASTFM_API_KEY } from "../extension/config.js";


// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Replace fetch for one test (restored automatically when the test ends).
// `respond` receives the requested URL and returns a Response (or throws).
function fakeFetch(t, respond)
{
    return t.mock.method(globalThis, "fetch", async (url) => respond(new URL(String(url))));
}

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const text = (body, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "text/html" } });

// Make one request and return the URL that was actually fetched
async function requestedUrl(t, method, params)
{
    let seen;
    fakeFetch(t, (url) => { seen = url; return json({ ok: true }); });
    await lastfmGet(method, params);
    return seen;
}

// Matcher for assert.rejects: a LastfmError with the given code
const lastfmError = (code) => (err) =>
{
    assert.ok(err instanceof LastfmError, `expected a LastfmError, got ${err?.name}: ${err?.message}`);
    assert.equal(err.code, code);
    return true;
};


// ─────────────────────────────────────────────────────────────
// 1. Building the request
// ─────────────────────────────────────────────────────────────
describe("Request URL", () =>
{
    test("calls the Last.fm API root over HTTPS", async (t) =>
    {
        const url = await requestedUrl(t, "user.getinfo", { user: "rj" });
        assert.equal(url.origin + url.pathname, "https://ws.audioscrobbler.com/2.0/");
    });

    test("adds method, api_key and format=json", async (t) =>
    {
        const url = await requestedUrl(t, "user.getinfo", { user: "rj" });
        assert.equal(url.searchParams.get("method"), "user.getinfo");
        assert.equal(url.searchParams.get("api_key"), LASTFM_API_KEY);
        assert.equal(url.searchParams.get("format"), "json");
    });

    test("passes every parameter through", async (t) =>
    {
        const url = await requestedUrl(t, "user.gettopartists", { user: "rj", period: "6month", limit: 200, page: 2 });
        assert.equal(url.searchParams.get("user"), "rj");
        assert.equal(url.searchParams.get("period"), "6month");
        assert.equal(url.searchParams.get("limit"), "200");
        assert.equal(url.searchParams.get("page"), "2");
    });

    test("works with no params at all", async (t) =>
    {
        const url = await requestedUrl(t, "chart.gettopartists");
        assert.equal(url.searchParams.get("method"), "chart.gettopartists");
    });

    test("leaves out params that are undefined or null (never sends the text 'undefined')", async (t) =>
    {
        const url = await requestedUrl(t, "user.gettopartists", { user: "rj", period: undefined, page: null });
        assert.equal(url.searchParams.has("period"), false);
        assert.equal(url.searchParams.has("page"), false);
        assert.ok(!url.search.includes("undefined"));
        assert.ok(!url.search.includes("null"));
    });

    test("caller params cannot override method, api_key or format", async (t) =>
    {
        const url = await requestedUrl(t, "artist.getsimilar", {
            artist: "Cher", method: "user.getinfo", api_key: "stolen", format: "xml",
        });
        assert.equal(url.searchParams.getAll("method").join(), "artist.getsimilar");
        assert.equal(url.searchParams.getAll("api_key").join(), LASTFM_API_KEY);
        assert.equal(url.searchParams.getAll("format").join(), "json");
    });

    test("makes exactly one GET request", async (t) =>
    {
        const fetchMock = fakeFetch(t, () => json({ ok: true }));
        await lastfmGet("user.getinfo", { user: "rj" });
        assert.equal(fetchMock.mock.callCount(), 1);
        const options = fetchMock.mock.calls[0].arguments[1];
        assert.ok(options === undefined || options.method === undefined || options.method === "GET");
    });
});


// ─────────────────────────────────────────────────────────────
// 2. Encoding: artist names that break naive URL building
// ─────────────────────────────────────────────────────────────
describe("Encoding of artist names", () =>
{
    const tricky = [
        "Simon & Garfunkel",     // & would start a new parameter
        "AC/DC",                 // slash
        "C# Major",              // # would start a URL fragment
        "a+b",                   // + would become a space
        "Guns N' Roses",         // apostrophe
        "Tyler, The Creator",    // comma
        "100% Pure",             // % would start an escape sequence
        "Who? = Me",             // ? and =
        "فيروز",                 // Arabic
        "Кино",                  // Cyrillic
        "宇多田ヒカル",           // Japanese
        "Beyoncé",               // accent
        "  spaced  out  ",       // spaces are sent as given (cleaning is not the wrapper's job)
    ];

    for (const artist of tricky)
    {
        test(`round-trips "${artist}" exactly`, async (t) =>
        {
            const url = await requestedUrl(t, "artist.getsimilar", { artist, limit: 10 });
            assert.equal(url.searchParams.get("artist"), artist);
            assert.equal(url.searchParams.get("limit"), "10", "a special character broke the next parameter");
        });
    }
});


// ─────────────────────────────────────────────────────────────
// 3. Success
// ─────────────────────────────────────────────────────────────
describe("Successful responses", () =>
{
    test("returns a Promise", (t) =>
    {
        fakeFetch(t, () => json({}));
        assert.ok(lastfmGet("user.getinfo", { user: "rj" }) instanceof Promise);
    });

    test("resolves with the parsed JSON body, unchanged", async (t) =>
    {
        const body = { topartists: { artist: [{ name: "Radiohead", playcount: "3021" }], "@attr": { user: "rj" } } };
        fakeFetch(t, () => json(body));
        assert.deepEqual(await lastfmGet("user.gettopartists", { user: "rj" }), body);
    });

    test("keeps non-Latin text intact", async (t) =>
    {
        const body = { artist: { name: "فيروز" } };
        fakeFetch(t, () => json(body));
        assert.deepEqual(await lastfmGet("artist.getinfo", { artist: "فيروز" }), body);
    });
});


// ─────────────────────────────────────────────────────────────
// 4. Errors reported by Last.fm (error field in the body)
// ─────────────────────────────────────────────────────────────
describe("Last.fm errors", () =>
{
    test("unknown user (code 6) → LastfmError with code 6 and Last.fm's message", async (t) =>
    {
        fakeFetch(t, () => json({ error: 6, message: "User not found" }, 404));
        await assert.rejects(lastfmGet("user.getinfo", { user: "nobody" }), (err) =>
        {
            lastfmError(6)(err);
            assert.match(err.message, /User not found/);
            return true;
        });
    });

    test("error in the body is detected even when the HTTP status is 200", async (t) =>
    {
        fakeFetch(t, () => json({ error: 6, message: "The artist you supplied could not be found" }, 200));
        await assert.rejects(lastfmGet("artist.getinfo", { artist: "zzzz" }), lastfmError(6));
    });

    const codes = [
        [8, "Operation failed", 500],
        [10, "Invalid API key", 403],
        [11, "Service Offline", 503],
        [16, "Temporary error", 503],
        [26, "Suspended API key", 403],
        [29, "Rate limit exceeded", 429],
    ];
    for (const [code, message, status] of codes)
    {
        test(`code ${code} (${message}) keeps its numeric code`, async (t) =>
        {
            fakeFetch(t, () => json({ error: code, message }, status));
            await assert.rejects(lastfmGet("user.getinfo", { user: "rj" }), lastfmError(code));
        });
    }

    test("the code is a number, not a string", async (t) =>
    {
        fakeFetch(t, () => json({ error: 29, message: "Rate limit exceeded" }, 429));
        await assert.rejects(lastfmGet("user.getinfo", { user: "rj" }), (err) =>
        {
            assert.equal(typeof err.code, "number");
            return true;
        });
    });
});


// ─────────────────────────────────────────────────────────────
// 5. Failures that don't come from Last.fm
// ─────────────────────────────────────────────────────────────
describe("Network and bad responses", () =>
{
    test("fetch fails (offline, DNS, blocked) → NETWORK", async (t) =>
    {
        fakeFetch(t, () => { throw new TypeError("fetch failed"); });
        await assert.rejects(lastfmGet("user.getinfo", { user: "rj" }), lastfmError("NETWORK"));
    });

    test("HTML error page from a proxy or outage → BAD_RESPONSE", async (t) =>
    {
        fakeFetch(t, () => text("<html><body>502 Bad Gateway</body></html>", 502));
        await assert.rejects(lastfmGet("user.getinfo", { user: "rj" }), lastfmError("BAD_RESPONSE"));
    });

    test("empty body → BAD_RESPONSE", async (t) =>
    {
        fakeFetch(t, () => text("", 200));
        await assert.rejects(lastfmGet("user.getinfo", { user: "rj" }), lastfmError("BAD_RESPONSE"));
    });

    test("truncated JSON → BAD_RESPONSE", async (t) =>
    {
        fakeFetch(t, () => text('{"topartists": {"artist": [', 200));
        await assert.rejects(lastfmGet("user.getinfo", { user: "rj" }), lastfmError("BAD_RESPONSE"));
    });

    test("valid JSON that is null → BAD_RESPONSE (not a crash reading .error)", async (t) =>
    {
        fakeFetch(t, () => json(null));
        await assert.rejects(lastfmGet("user.getinfo", { user: "rj" }), lastfmError("BAD_RESPONSE"));
    });

    test("non-OK status with JSON but no error field → BAD_RESPONSE", async (t) =>
    {
        fakeFetch(t, () => json({}, 500));
        await assert.rejects(lastfmGet("user.getinfo", { user: "rj" }), lastfmError("BAD_RESPONSE"));
    });
});


// ─────────────────────────────────────────────────────────────
// 6. The LastfmError class
// ─────────────────────────────────────────────────────────────
describe("LastfmError", () =>
{
    test("is a real Error subclass with name 'LastfmError'", async (t) =>
    {
        fakeFetch(t, () => json({ error: 10, message: "Invalid API key" }, 403));
        await assert.rejects(lastfmGet("user.getinfo", { user: "rj" }), (err) =>
        {
            assert.ok(err instanceof Error);
            assert.ok(err instanceof LastfmError);
            assert.equal(err.name, "LastfmError");
            assert.equal(typeof err.message, "string");
            assert.ok(err.message.length > 0);
            assert.ok(typeof err.stack === "string");
            return true;
        });
    });

    test("NETWORK and BAD_RESPONSE errors have readable messages too", async (t) =>
    {
        fakeFetch(t, () => { throw new TypeError("fetch failed"); });
        await assert.rejects(lastfmGet("user.getinfo", { user: "rj" }), (err) =>
        {
            assert.ok(err.message.length > 0);
            return true;
        });
    });

    test("errors are thrown, never swallowed (no resolving with undefined)", async (t) =>
    {
        fakeFetch(t, () => { throw new TypeError("fetch failed"); });
        let resolved = false;
        try { await lastfmGet("user.getinfo", { user: "rj" }); resolved = true; }
        catch { /* expected */ }
        assert.equal(resolved, false);
    });
});


// ─────────────────────────────────────────────────────────────
// 7. Wrong argument types: refuse, don't run (same rule as normalize.js)
// ─────────────────────────────────────────────────────────────
describe("Wrong argument types are refused", () =>
{
    test("method must be a non-empty string", async (t) =>
    {
        const fetchMock = fakeFetch(t, () => json({}));
        for (const bad of [undefined, null, 42, "", "   ", ["user.getinfo"], {}])
        {
            await assert.rejects(lastfmGet(bad, { user: "rj" }), TypeError, `accepted method ${JSON.stringify(bad)}`);
        }
        assert.equal(fetchMock.mock.callCount(), 0, "a request was made with an invalid method");
    });

    test("params must be a plain object (or left out)", async (t) =>
    {
        const fetchMock = fakeFetch(t, () => json({}));
        for (const bad of [null, "user=rj", 42, ["rj"], true])
        {
            await assert.rejects(lastfmGet("user.getinfo", bad), TypeError, `accepted params ${JSON.stringify(bad)}`);
        }
        assert.equal(fetchMock.mock.callCount(), 0, "a request was made with invalid params");
    });

    test("argument errors are TypeErrors, not LastfmErrors", async (t) =>
    {
        fakeFetch(t, () => json({}));
        await assert.rejects(lastfmGet(null), (err) =>
        {
            assert.ok(!(err instanceof LastfmError));
            return true;
        });
    });
});