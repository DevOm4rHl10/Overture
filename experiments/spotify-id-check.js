// experiments/spotify-id-check.js
//
// Question: can Spotify IDs (Layer 3) tell us that two names in different
// scripts are the same artist, for the scripts Layer 2 doesn't cover
// (Korean, Japanese, Chinese, Thai, Hebrew) and the one-word names Layer 2
// refuses to match?
//
// How it works: search each name on Spotify, take the top artist result,
// compare the IDs of the two names in each pair.
//
// HOW TO RUN (browser, not Node):
//   1. chrome://extensions → Overture → click "service worker" (opens its console)
//   2. Make sure you're signed in to Spotify and the token is fresh:
//      run TEST_SOURCE or TEST_GRAPH once from the popup first.
//   3. Paste this whole file into the console, press Enter.
//   4. Results print as a table + a summary. Copy them back to Claude.
//
// If it can't find the token, set it by hand on the line marked MANUAL_TOKEN.
//
// The pairs below are my best knowledge of real names: check the
// "top result" columns, a wrong top result is a search miss, not an ID result.

(async () => {

    const MANUAL_TOKEN = null;        // paste an access token here if needed
    const PAUSE_MS = 150;             // between Spotify searches
    const SEARCH_LIMIT = 3;

    // expected: "same"      = one artist, two spellings → IDs should match
    //           "different" = two artists → IDs should differ
    const PAIRS = [
        // Korean (not covered by Layer 2)
        ["Korean", "BTS", "방탄소년단", "same"],
        ["Korean", "IU", "아이유", "same"],
        ["Korean", "BLACKPINK", "블랙핑크", "same"],
        ["Korean", "Epik High", "에픽하이", "same"],
        ["Korean", "AKMU", "악뮤", "same"],
        ["Korean", "Zion.T", "자이언티", "same"],
        ["Korean", "Jung Kook", "정국", "same"],

        // Japanese
        ["Japanese", "Hikaru Utada", "宇多田ヒカル", "same"],
        ["Japanese", "Kenshi Yonezu", "米津玄師", "same"],
        ["Japanese", "Aimyon", "あいみょん", "same"],
        ["Japanese", "Fujii Kaze", "藤井風", "same"],

        // Chinese
        ["Chinese", "Jay Chou", "周杰倫", "same"],
        ["Chinese", "Zhou Shen", "周深", "same"],
        ["Chinese", "G.E.M.", "鄧紫棋", "same"],
        ["Chinese", "Eason Chan", "陳奕迅", "same"],

        // Thai
        ["Thai", "Bodyslam", "บอดี้สแลม", "same"],
        ["Thai", "Palmy", "ปาล์มมี่", "same"],

        // Hebrew
        ["Hebrew", "Omer Adam", "עומר אדם", "same"],
        ["Hebrew", "Eden Ben Zaken", "עדן בן זקן", "same"],

        // One-word names Layer 2 refuses to match
        ["One-word", "Kino", "Кино", "same"],
        ["One-word", "Zemfira", "Земфира", "same"],
        ["One-word", "Ceca", "Цеца", "same"],
        ["One-word", "Fairuz", "فيروز", "same"],

        // Controls: different artists that Layer 2 once merged by mistake
        ["Control", "Nanna", "На-На", "different"],
        ["Control", "YUTA", "Юта", "different"],
        ["Control", "Anastasia", "Анастасија", "different"],

        // Group ↔ member: different artists on Spotify
        ["Group/member", "BTS", "RM", "different"],
        ["Group/member", "SHINee", "온유", "different"]
    ];

    // ---------------------------------------------------------------- token

    async function findToken() {
        if (MANUAL_TOKEN) return MANUAL_TOKEN;

        const all = await chrome.storage.local.get(null);
        const candidates = [];

        // Look through stored values (and one level of nested objects) for
        // something that looks like a Spotify access token.
        const visit = (value, path) => {
            if (typeof value === "string") {
                if (/access/i.test(path) && !/refresh/i.test(path) && value.length > 50) {
                    candidates.push({ path, value });
                } else if (value.startsWith("BQ") && value.length > 100) {
                    candidates.push({ path, value });
                }
            } else if (value && typeof value === "object" && !Array.isArray(value)) {
                for (const [k, v] of Object.entries(value)) visit(v, path + "." + k);
            }
        };
        for (const [k, v] of Object.entries(all)) visit(v, k);

        if (candidates.length === 0) return null;
        console.log("Using token found at:", candidates[0].path);
        return candidates[0].value;
    }

    const token = await findToken();
    if (!token) {
        console.error("No Spotify token found. Sign in from the popup, or set MANUAL_TOKEN.");
        return;
    }

    // --------------------------------------------------------------- search

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const searchCache = new Map();

    async function topArtist(name) {
        if (searchCache.has(name)) return searchCache.get(name);

        const url = "https://api.spotify.com/v1/search?" + new URLSearchParams({
            q: name,
            type: "artist",
            limit: String(SEARCH_LIMIT)
        });

        const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });

        if (res.status === 401) {
            throw new Error("401 from Spotify: token expired. Run TEST_SOURCE from the popup, then paste this again.");
        }
        if (res.status === 429) {
            throw new Error("429 from Spotify: rate limited. Wait a minute and raise PAUSE_MS.");
        }
        if (!res.ok) {
            throw new Error("Spotify search failed (" + res.status + ") for " + name);
        }

        const data = await res.json();
        const items = (data && data.artists && data.artists.items) || [];
        const top = items[0] || null;

        const result = top
            ? {
                id: top.id,
                name: top.name,
                popularity: top.popularity ?? "",
                followers: top.followers?.total ?? "",
                others: items.slice(1).map(a => a.name).join(" | ")
            }
            : null;

        searchCache.set(name, result);
        await sleep(PAUSE_MS);
        return result;
    }

    // ------------------------------------------------------------------ run

    const rows = [];

    for (const [group, a, b, expected] of PAIRS) {
        const ra = await topArtist(a);
        const rb = await topArtist(b);

        let got;
        if (!ra || !rb) got = "no result";
        else got = ra.id === rb.id ? "same" : "different";

        rows.push({
            group,
            pair: a + "  ↔  " + b,
            expected,
            got,
            ok: got === expected ? "✔" : "✘",
            topA: ra ? ra.name : "—",
            topB: rb ? rb.name : "—",
            idA: ra ? ra.id : "—",
            idB: rb ? rb.id : "—",
            othersB: rb ? rb.others : ""
        });
    }

    console.table(rows, ["group", "pair", "expected", "got", "ok", "topA", "topB"]);

    // Summary per group
    const summary = {};
    for (const r of rows) {
        summary[r.group] ??= { pairs: 0, correct: 0, wrongMerge: 0, missed: 0, noResult: 0 };
        const s = summary[r.group];
        s.pairs++;
        if (r.got === "no result") s.noResult++;
        else if (r.ok === "✔") s.correct++;
        else if (r.expected === "different") s.wrongMerge++;   // the dangerous one
        else s.missed++;
    }
    console.log("Summary (wrongMerge = different artists given the same ID):");
    console.table(summary);

    // Full rows as JSON, easy to copy back
    console.log("Full results (copy this):");
    console.log(JSON.stringify(rows, null, 2));

})().catch(err => console.error(err.message || err));
