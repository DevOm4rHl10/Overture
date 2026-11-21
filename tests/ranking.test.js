// Tests for extension/ranking.js
// Run from the repo root: node --test
// Pure functions: no fetch, no storage. The real normalize.js and
// transliterate.js are used, so Layer 1 + Layer 2 are tested in context.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
    collectCandidates,
    sortByScore,
    removeKnown,
    removeCollaborations,
    mergeDuplicates,
    capPerSeed,
    buildPool,
    applyObscurity,
    toRecommendations,
    rankPool
} from "../extension/ranking.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const url = (name) => "https://www.last.fm/music/" + encodeURIComponent(name);

// A graph entry, as buildSimilarityGraph returns it
function seed(source, weight, list) {
    return {
        source,
        weight,
        similar: list.map(([name, match]) => ({ name, match, url: url(name), mbid: null }))
    };
}

// A candidate, as sortByScore returns it (because sorted, score = sum)
function cand(name, because, extra = {}) {
    const b = because
        .map(([source, contribution]) => ({ source, contribution }))
        .sort((x, y) => y.contribution - x.contribution);
    return {
        name,
        url: url(name),
        because: b,
        score: b.reduce((s, x) => s + x.contribution, 0),
        ...extra
    };
}

const known = (...names) => names.map((name) => ({ name, weight: 1 }));
const names = (list) => list.map((c) => c.name);
const mainSeeds = (list) => list.map((c) => c.because[0].source);
const close = (actual, expected, label = "") =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${label} expected ${expected}, got ${actual}`);

function countBy(list, key) {
    const out = {};
    for (const x of list) out[key(x)] = (out[key(x)] ?? 0) + 1;
    return out;
}

const deepCopy = (x) => JSON.parse(JSON.stringify(x));

const BAD_ARRAYS = [undefined, null, "x", 42, {}, { length: 1, 0: {} }];
const label = (v) => (typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? String(v));

// ===========================================================================
// collectCandidates
// ===========================================================================

describe("collectCandidates", () => {

    for (const bad of BAD_ARRAYS) {
        test(`graph ${label(bad)} → TypeError`, () => {
            assert.throws(() => collectCandidates(bad), TypeError);
        });
    }

    test("empty graph → []", () => {
        assert.deepEqual(collectCandidates([]), []);
    });

    test("one seed: one candidate per similar artist, contribution = match × weight", () => {
        const result = collectCandidates([seed("BTS", 0.5, [["RM", 1], ["Agust D", 0.8]])]);
        assert.deepEqual(names(result), ["RM", "Agust D"]);
        assert.deepEqual(result[0].because, [{ source: "BTS", contribution: 0.5 }]);
        close(result[1].because[0].contribution, 0.4);
    });

    test("output entries have exactly name, url, because", () => {
        const [c] = collectCandidates([seed("BTS", 1, [["RM", 1]])]);
        assert.deepEqual(Object.keys(c).sort(), ["because", "name", "url"]);
        assert.equal(c.url, url("RM"));
    });

    test("the same artist from two seeds → one candidate with two reasons", () => {
        const result = collectCandidates([
            seed("MIA BOYKA", 1, [["Zivert", 0.8]]),
            seed("Lusia Chebotina", 0.5, [["Zivert", 0.6]])
        ]);
        assert.equal(result.length, 1);
        assert.deepEqual(result[0].because.map((b) => b.source).sort(), ["Lusia Chebotina", "MIA BOYKA"]);
    });

    test("grouping uses normalizeArtist (case and spaces don't matter)", () => {
        const result = collectCandidates([
            seed("A", 1, [["Zivert", 0.5]]),
            seed("B", 1, [["  ZIVERT ", 0.5]])
        ]);
        assert.equal(result.length, 1);
    });

    test("name and URL come from the largest contribution", () => {
        const g = [
            seed("A", 0.2, [["zivert", 1]]),      // 0.2
            seed("B", 1, [["Zivert", 0.9]])       // 0.9 → wins
        ];
        g[0].similar[0].url = "small";
        g[1].similar[0].url = "big";
        const [c] = collectCandidates(g);
        assert.equal(c.name, "Zivert");
        assert.equal(c.url, "big");
    });

    test("on equal contributions, the first spelling seen is kept", () => {
        const [c] = collectCandidates([
            seed("A", 1, [["Zivert", 0.5]]),
            seed("B", 1, [["ZIVERT", 0.5]])
        ]);
        assert.equal(c.name, "Zivert");
    });

    test("one seed listing two spellings counts once (its largest contribution, not the sum)", () => {
        const [c] = collectCandidates([seed("A", 1, [["Zivert", 0.9], ["ZIVERT", 0.4]])]);
        assert.deepEqual(c.because, [{ source: "A", contribution: 0.9 }]);
    });

    test("names are trimmed", () => {
        const [c] = collectCandidates([seed("A", 1, [["  Jul  ", 1]])]);
        assert.equal(c.name, "Jul");
    });

    test("missing url → null", () => {
        const [c] = collectCandidates([{ source: "A", weight: 1, similar: [{ name: "X", match: 1 }] }]);
        assert.equal(c.url, null);
    });

    test("non-Latin names are kept as they are", () => {
        const result = collectCandidates([seed("A", 1, [["Люся Чеботина", 1], ["عمرو الدريني", 0.5]])]);
        assert.deepEqual(names(result), ["Люся Чеботина", "عمرو الدريني"]);
    });

    test("bad seeds are skipped, valid ones still processed", () => {
        const good = seed("Good", 1, [["Kept", 1]]);
        const result = collectCandidates([
            null, undefined, "BTS", 42,
            { weight: 1, similar: [{ name: "X1", match: 1 }] },                   // no source
            { source: "   ", weight: 1, similar: [{ name: "X2", match: 1 }] },    // blank source
            { source: "S", similar: [{ name: "X3", match: 1 }] },                 // no weight
            { source: "S", weight: "1", similar: [{ name: "X4", match: 1 }] },
            { source: "S", weight: NaN, similar: [{ name: "X5", match: 1 }] },
            { source: "S", weight: -0.1, similar: [{ name: "X6", match: 1 }] },
            { source: "S", weight: 1.5, similar: [{ name: "X7", match: 1 }] },
            { source: "S", weight: 1, similar: "X8" },                            // similar not an array
            good
        ]);
        assert.deepEqual(names(result), ["Kept"]);
    });

    test("bad similar entries are skipped, valid ones kept", () => {
        const result = collectCandidates([{
            source: "A", weight: 1, similar: [
                null, "X", 42,
                { match: 1 },                    // no name
                { name: 5, match: 1 },
                { name: "   ", match: 1 },
                { name: "NoMatch" },
                { name: "StringMatch", match: "0.5" },
                { name: "NaNMatch", match: NaN },
                { name: "TooHigh", match: 1.5 },
                { name: "Negative", match: -0.1 },
                { name: "Good", match: 0.5 }
            ]
        }]);
        assert.deepEqual(names(result), ["Good"]);
    });

    test("a contribution of 0 is not a reason (match 0 or weight 0)", () => {
        const result = collectCandidates([
            seed("A", 1, [["ZeroMatch", 0]]),
            seed("B", 0, [["ZeroWeight", 1]])
        ]);
        for (const c of result) assert.deepEqual(c.because, [], `${c.name} should have no reason`);
    });

    test("does not modify its input", () => {
        const g = [seed("A", 1, [["X", 1]])];
        const before = deepCopy(g);
        collectCandidates(g);
        assert.deepEqual(g, before);
    });
});

// ===========================================================================
// sortByScore
// ===========================================================================

describe("sortByScore", () => {

    for (const bad of BAD_ARRAYS) {
        test(`candidates ${label(bad)} → TypeError`, () => {
            assert.throws(() => sortByScore(bad), TypeError);
        });
    }

    test("empty list → []", () => {
        assert.deepEqual(sortByScore([]), []);
    });

    test("score = sum of contributions", () => {
        const [c] = sortByScore([{ name: "X", url: "u", because: [
            { source: "A", contribution: 0.3 },
            { source: "B", contribution: 0.2 }
        ] }]);
        close(c.score, 0.5);
    });

    test("candidates sorted by score, biggest first", () => {
        const result = sortByScore([
            { name: "Low", url: null, because: [{ source: "A", contribution: 0.1 }] },
            { name: "High", url: null, because: [{ source: "A", contribution: 0.9 }] },
            { name: "Mid", url: null, because: [{ source: "A", contribution: 0.5 }] }
        ]);
        assert.deepEqual(names(result), ["High", "Mid", "Low"]);
    });

    test("each because list sorted, biggest first (because[0] = main seed)", () => {
        const [c] = sortByScore([{ name: "X", url: null, because: [
            { source: "Small", contribution: 0.1 },
            { source: "Big", contribution: 0.7 },
            { source: "Mid", contribution: 0.3 }
        ] }]);
        assert.deepEqual(c.because.map((b) => b.source), ["Big", "Mid", "Small"]);
    });

    test("ties broken by name, so the order never shuffles", () => {
        const result = sortByScore([
            { name: "Charlie", url: null, because: [{ source: "A", contribution: 0.5 }] },
            { name: "alpha", url: null, because: [{ source: "A", contribution: 0.5 }] },
            { name: "Bravo", url: null, because: [{ source: "A", contribution: 0.5 }] }
        ]);
        assert.deepEqual(names(result), ["alpha", "Bravo", "Charlie"]);
    });

    test("the same seed twice in because counts once (its largest contribution)", () => {
        const [c] = sortByScore([{ name: "X", url: null, because: [
            { source: "A", contribution: 0.4 },
            { source: "A", contribution: 0.6 }
        ] }]);
        assert.deepEqual(c.because, [{ source: "A", contribution: 0.6 }]);
        close(c.score, 0.6);
    });

    test("bad because items are skipped", () => {
        const [c] = sortByScore([{ name: "X", url: null, because: [
            null, "A",
            { contribution: 0.5 },
            { source: "", contribution: 0.5 },
            { source: "B" },
            { source: "C", contribution: "0.5" },
            { source: "D", contribution: NaN },
            { source: "E", contribution: -0.1 },
            { source: "Good", contribution: 0.2 }
        ] }]);
        assert.deepEqual(c.because, [{ source: "Good", contribution: 0.2 }]);
    });

    test("a candidate with no valid reason is dropped", () => {
        const result = sortByScore([
            { name: "Empty", url: null, because: [] },
            { name: "OnlyBad", url: null, because: [{ source: "A", contribution: -1 }] },
            { name: "OnlyZero", url: null, because: [{ source: "A", contribution: 0 }] },
            { name: "Good", url: null, because: [{ source: "A", contribution: 0.1 }] }
        ]);
        assert.deepEqual(names(result), ["Good"]);
    });

    test("malformed candidates are skipped", () => {
        const result = sortByScore([
            null, "X", 42,
            { because: [{ source: "A", contribution: 1 }] },
            { name: "", because: [{ source: "A", contribution: 1 }] },
            { name: "NoBecause" },
            { name: "Good", url: null, because: [{ source: "A", contribution: 1 }] }
        ]);
        assert.deepEqual(names(result), ["Good"]);
    });

    test("keeps url, adds score", () => {
        const [c] = sortByScore([{ name: "X", url: "u", because: [{ source: "A", contribution: 1 }] }]);
        assert.deepEqual(Object.keys(c).sort(), ["because", "name", "score", "url"]);
        assert.equal(c.url, "u");
    });

    test("does not modify its input", () => {
        const input = [{ name: "X", url: "u", because: [
            { source: "Small", contribution: 0.1 },
            { source: "Big", contribution: 0.9 }
        ] }];
        const before = deepCopy(input);
        sortByScore(input);
        assert.deepEqual(input, before);
    });

    test("collectCandidates → sortByScore: zero-contribution candidates disappear", () => {
        const result = sortByScore(collectCandidates([seed("A", 1, [["Zero", 0], ["Kept", 0.5]])]));
        assert.deepEqual(names(result), ["Kept"]);
    });
});

// ===========================================================================
// removeKnown
// ===========================================================================

describe("removeKnown", () => {

    for (const bad of BAD_ARRAYS) {
        test(`candidates ${label(bad)} → TypeError`, () => {
            assert.throws(() => removeKnown(bad, known("A")), TypeError);
        });
        test(`knownArtists ${label(bad)} → TypeError`, () => {
            assert.throws(() => removeKnown([cand("X", [["A", 1]])], bad), TypeError);
        });
    }

    test("removes an exact known name", () => {
        const result = removeKnown([cand("Zivert", [["A", 1]]), cand("Jakone", [["A", 1]])], known("Zivert"));
        assert.deepEqual(names(result), ["Jakone"]);
    });

    test("Layer 1: case and spaces don't matter", () => {
        const result = removeKnown([cand("MIA BOYKA", [["A", 1]]), cand("  bearwolf ", [["A", 1]])],
            known("Mia Boyka", "BEARWOLF"));
        assert.deepEqual(result, []);
    });

    test("Layer 2: the same artist in another script is removed", () => {
        const result = removeKnown([cand("Клава Кока", [["A", 1]]), cand("Yulianna Karaulova", [["A", 1]])],
            known("Klava Koka", "Юлианна Караулова"));
        assert.deepEqual(result, []);
    });

    test("Layer 2: ю after a consonant (Люся Чеботина is removed when Lusia Chebotina is known)", () => {
        assert.deepEqual(removeKnown([cand("Люся Чеботина", [["A", 1]])], known("Lusia Chebotina")), []);
    });

    test("weight-0 known artists are removed too", () => {
        const result = removeKnown([cand("Jimin", [["BTS", 1]])], [{ name: "Jimin", weight: 0 }]);
        assert.deepEqual(result, []);
    });

    test("a known artist with a missing or broken weight still counts as known", () => {
        const result = removeKnown(
            [cand("A1", [["S", 1]]), cand("A2", [["S", 1]]), cand("A3", [["S", 1]])],
            [{ name: "A1" }, { name: "A2", weight: "x" }, { name: "A3", weight: 7 }]
        );
        assert.deepEqual(result, []);
    });

    test("bad known entries are skipped without crashing", () => {
        const result = removeKnown([cand("Zivert", [["A", 1]])],
            [null, "Zivert", 42, {}, { name: "" }, { name: 5 }]);
        assert.deepEqual(names(result), ["Zivert"]);
    });

    test("no known artists → everything kept, order unchanged", () => {
        const input = [cand("B", [["S", 0.1]]), cand("A", [["S", 0.9]])];
        assert.deepEqual(names(removeKnown(input, [])), ["B", "A"]);
    });

    test("malformed candidates are skipped", () => {
        const result = removeKnown([null, "X", { name: "" }, { name: 5 }, cand("Good", [["A", 1]])], []);
        assert.deepEqual(names(result), ["Good"]);
    });

    test("different artists with similar names stay (Latin ↔ Latin is never merged)", () => {
        const result = removeKnown([cand("Beyonce", [["A", 1]]), cand("Anna", [["A", 1]])], known("Beyoncé", "Ana"));
        assert.deepEqual(names(result), ["Beyonce", "Anna"]);
    });

    test("does not modify its input", () => {
        const input = [cand("Zivert", [["A", 1]]), cand("Jakone", [["A", 1]])];
        const before = deepCopy(input);
        removeKnown(input, known("Zivert"));
        assert.deepEqual(input, before);
    });

    test("spacing doesn't matter: 47 Soul is removed when 47Soul is known, and the reverse", () => {
        assert.deepEqual(names(removeKnown([cand("47 Soul", [["A", 1]])], known("47Soul"))), []);
        assert.deepEqual(names(removeKnown([cand("47Soul", [["A", 1]])], known("47 Soul"))), []);
    });

    test("spacing: initials and joined words (found on real data)", () => {
        const input = [cand("S. Janaki", [["A", 1]]), cand("K.J.Yesudas", [["A", 1]]),
            cand("Sidhu Moosewala", [["A", 1]]), cand("Bonez MC", [["A", 1]])];
        const result = removeKnown(input, known("S.Janaki", "K. J. Yesudas", "Sidhu Moose Wala", "BonezMC"));
        assert.deepEqual(names(result), []);
    });

    test("spacing: case still doesn't matter, and other whitespace (tab, no-break space) counts as space", () => {
        const result = removeKnown([cand("47\u00A0SOUL", [["A", 1]]), cand("Ali\tKiba", [["A", 1]])], known("47soul", "Alikiba"));
        assert.deepEqual(names(result), []);
    });

    test("spacing: Arabic names with and without the space in عبد", () => {
        const result = removeKnown([cand("عبد الله الرويشد", [["A", 1]])], known("عبدالله الرويشد"));
        assert.deepEqual(names(result), []);
    });

    test("spacing only: punctuation and letters still have to match", () => {
        const input = [cand("47 Souls", [["A", 1]]), cand("47-Soul", [["A", 1]])];
        assert.deepEqual(names(removeKnown(input, known("47Soul"))), ["47 Souls", "47-Soul"]);
    });

    // Documented limits: current, decided behavior. If Layer 2 changes, update these.
    describe("known limits (decided)", () => {
        test("spacing match can hide a different artist: Laylow is removed when Lay Low is known", () => {
            assert.deepEqual(names(removeKnown([cand("Laylow", [["A", 1]])], known("Lay Low"))), []);
        });


        test("one-word names in two scripts are never matched: Кино stays when Kino is known", () => {
            assert.deepEqual(names(removeKnown([cand("Кино", [["A", 1]])], known("Kino"))), ["Кино"]);
        });

        test("unsupported scripts are never matched: 방탄소년단 stays when BTS is known", () => {
            assert.deepEqual(names(removeKnown([cand("방탄소년단", [["A", 1]])], known("BTS"))), ["방탄소년단"]);
        });
    });
});

// ===========================================================================
// removeCollaborations
// ===========================================================================

describe("removeCollaborations", () => {

    for (const bad of BAD_ARRAYS) {
        test(`candidates ${label(bad)} → TypeError`, () => {
            assert.throws(() => removeCollaborations(bad, known("A")), TypeError);
        });
        test(`knownArtists ${label(bad)} → TypeError`, () => {
            assert.throws(() => removeCollaborations([cand("X", [["A", 1]])], bad), TypeError);
        });
    }

    test("a \", \" page containing a known artist is removed (either position)", () => {
        const result = removeCollaborations(
            [cand("BTS, Halsey", [["BTS", 1]]), cand("Coldplay, BTS", [["BTS", 1]])],
            known("BTS")
        );
        assert.deepEqual(result, []);
    });

    test("three or more parts: one known part is enough", () => {
        const result = removeCollaborations([cand("A1, BTS, A3", [["S", 1]])], known("BTS"));
        assert.deepEqual(result, []);
    });

    test("a \", \" page with no known artist is kept", () => {
        const result = removeCollaborations([cand("Coldplay, Halsey", [["S", 1]])], known("BTS"));
        assert.deepEqual(names(result), ["Coldplay, Halsey"]);
    });

    test("\"Tyler, The Creator\" is kept unless \"The Creator\" or \"Tyler\" is known", () => {
        assert.deepEqual(names(removeCollaborations([cand("Tyler, The Creator", [["S", 1]])], known("Frank Ocean"))),
            ["Tyler, The Creator"]);
    });

    test("& is never split: real duos stay even when one member is known", () => {
        const result = removeCollaborations(
            [cand("Galibri & Mavik", [["S", 1]]), cand("Artik & Asti", [["S", 1]]), cand("Simon & Garfunkel", [["S", 1]])],
            known("Galibri", "Asti", "Simon")
        );
        assert.equal(result.length, 3);
    });

    test("other separators are never split: x, feat, and, /", () => {
        const input = ["Coldplay x BTS", "Coldplay feat. BTS", "Coldplay and BTS", "Coldplay/BTS"]
            .map((n) => cand(n, [["S", 1]]));
        assert.equal(removeCollaborations(input, known("BTS")).length, 4);
    });

    test("a comma without a space is not a separator", () => {
        assert.equal(removeCollaborations([cand("Coldplay,BTS", [["S", 1]])], known("BTS")).length, 1);
    });

    test("a single name is never treated as a collaboration (even if known: that's removeKnown's job)", () => {
        assert.equal(removeCollaborations([cand("BTS", [["S", 1]])], known("BTS")).length, 1);
    });

    test("a trailing \", \" leaves one part: kept", () => {
        assert.equal(removeCollaborations([cand("BTS, ", [["S", 1]])], known("BTS")).length, 1);
    });

    test("parts are matched with Layer 1 + 2 (case, other script)", () => {
        const result = removeCollaborations(
            [cand("bts, Halsey", [["S", 1]]), cand("Клава Кока, Zivert", [["S", 1]])],
            known("BTS", "Klava Koka")
        );
        assert.deepEqual(result, []);
    });

    test("order unchanged, malformed candidates skipped", () => {
        const result = removeCollaborations(
            [cand("B", [["S", 1]]), null, { name: "" }, cand("BTS, Halsey", [["S", 1]]), cand("A", [["S", 1]])],
            known("BTS")
        );
        assert.deepEqual(names(result), ["B", "A"]);
    });

    test("does not modify its input", () => {
        const input = [cand("BTS, Halsey", [["S", 1]]), cand("A", [["S", 1]])];
        const before = deepCopy(input);
        removeCollaborations(input, known("BTS"));
        assert.deepEqual(input, before);
    });
});

// ===========================================================================
// mergeDuplicates
// ===========================================================================

describe("mergeDuplicates", () => {

    for (const bad of BAD_ARRAYS) {
        test(`candidates ${label(bad)} → TypeError`, () => {
            assert.throws(() => mergeDuplicates(bad), TypeError);
        });
    }

    test("empty list → []", () => {
        assert.deepEqual(mergeDuplicates([]), []);
    });

    test("the same artist in two scripts → one candidate", () => {
        const result = mergeDuplicates([
            cand("Юлианна Караулова", [["MIA BOYKA", 0.3]]),
            cand("Yulianna Karaulova", [["Lusia Chebotina", 0.2]])
        ]);
        assert.equal(result.length, 1);
        assert.deepEqual(result[0].because.map((b) => b.source).sort(), ["Lusia Chebotina", "MIA BOYKA"]);
    });

    test("name and URL come from the entry with the largest single contribution", () => {
        const result = mergeDuplicates([
            cand("Клава Кока", [["A", 0.2], ["B", 0.2], ["C", 0.2]]),   // bigger sum, smaller single
            cand("Klava Koka", [["D", 0.5]])                            // largest single → wins
        ]);
        assert.equal(result[0].name, "Klava Koka");
        assert.equal(result[0].url, url("Klava Koka"));
    });

    test("on equal largest contributions, the earlier entry wins", () => {
        const result = mergeDuplicates([
            cand("Клава Кока", [["A", 0.5]]),
            cand("Klava Koka", [["B", 0.5]])
        ]);
        assert.equal(result[0].name, "Клава Кока");
    });

    test("the same seed in both → keeps its largest contribution, not the sum", () => {
        const [c] = mergeDuplicates([
            cand("Клава Кока", [["MIA BOYKA", 0.3]]),
            cand("Klava Koka", [["MIA BOYKA", 0.5]])
        ]);
        assert.deepEqual(c.because, [{ source: "MIA BOYKA", contribution: 0.5 }]);
    });

    test("merged score never double-counts a seed (through sortByScore)", () => {
        const [c] = sortByScore(mergeDuplicates([
            cand("Клава Кока", [["A", 0.3], ["B", 0.1]]),
            cand("Klava Koka", [["A", 0.4]])
        ]));
        close(c.score, 0.5);   // A: max(0.3, 0.4) + B: 0.1
    });

    test("different artists are not merged", () => {
        const input = [cand("Zivert", [["A", 1]]), cand("Jakone", [["A", 1]]), cand("Beyonce", [["A", 1]]), cand("Beyoncé", [["A", 1]])];
        assert.equal(mergeDuplicates(input).length, 4);
    });

    test("spacing is NOT ignored here (decided: only removeKnown ignores it)", () => {
        const input = [cand("Laylow", [["A", 1]]), cand("Lay Low", [["A", 1]]), cand("47Soul", [["B", 1]]), cand("47 Soul", [["B", 1]])];
        assert.equal(mergeDuplicates(input).length, 4);
    });

    test("one-word names in two scripts are not merged (Layer 2 guard)", () => {
        assert.equal(mergeDuplicates([cand("Кино", [["A", 1]]), cand("Kino", [["B", 1]])]).length, 2);
    });

    test("known false merges stay separate", () => {
        assert.equal(mergeDuplicates([cand("Nanna", [["A", 1]]), cand("На-На", [["B", 1]])]).length, 2);
        assert.equal(mergeDuplicates([cand("Sharon", [["A", 1]]), cand("شيرين", [["B", 1]])]).length, 2);
    });

    test("output order = order of first appearance", () => {
        const result = mergeDuplicates([
            cand("First", [["A", 0.1]]),
            cand("Клава Кока", [["A", 0.2]]),
            cand("Last", [["A", 0.9]]),
            cand("Klava Koka", [["B", 0.9]])
        ]);
        assert.deepEqual(names(result), ["First", "Klava Koka", "Last"]);
    });

    test("output has name, url, because (score is recomputed later by sortByScore)", () => {
        const [c] = mergeDuplicates([cand("X", [["A", 1]])]);
        assert.deepEqual(Object.keys(c).sort(), ["because", "name", "url"]);
    });

    test("candidates without a valid reason are dropped, malformed ones skipped", () => {
        const result = mergeDuplicates([
            null, "X", { name: "" }, { name: "NoBecause" },
            { name: "Empty", because: [] },
            { name: "OnlyBad", because: [{ source: "A", contribution: -1 }] },
            cand("Good", [["A", 1]])
        ]);
        assert.deepEqual(names(result), ["Good"]);
    });

    test("does not modify its input", () => {
        const input = [cand("Клава Кока", [["A", 0.3]]), cand("Klava Koka", [["B", 0.5]])];
        const before = deepCopy(input);
        mergeDuplicates(input);
        assert.deepEqual(input, before);
    });
});

// ===========================================================================
// capPerSeed
// ===========================================================================

describe("capPerSeed", () => {

    const list = [cand("X", [["A", 1]])];

    for (const bad of BAD_ARRAYS) {
        test(`candidates ${label(bad)} → TypeError`, () => {
            assert.throws(() => capPerSeed(bad, 3, 20), TypeError);
        });
    }

    for (const bad of [undefined, null, 0, -1, 1.5, NaN, Infinity, "3"]) {
        test(`maxPerSeed ${label(bad)} → TypeError`, () => {
            assert.throws(() => capPerSeed(list, bad, 20), TypeError);
        });
        test(`limit ${label(bad)} → TypeError`, () => {
            assert.throws(() => capPerSeed(list, 3, bad), TypeError);
        });
    }

    // 6 from A, 2 from B, 1 from C, sorted by score
    const sorted = sortByScore([
        cand("A1", [["A", 0.99]]), cand("A2", [["A", 0.98]]), cand("A3", [["A", 0.97]]),
        cand("A4", [["A", 0.96]]), cand("A5", [["A", 0.95]]), cand("A6", [["A", 0.94]]),
        cand("B1", [["B", 0.5]]), cand("B2", [["B", 0.4]]),
        cand("C1", [["C", 0.1]])
    ]);

    test("at most maxPerSeed per main seed, order kept", () => {
        assert.deepEqual(names(capPerSeed(sorted, 2, 5)), ["A1", "A2", "B1", "B2", "C1"]);
    });

    test("stops at limit", () => {
        assert.deepEqual(names(capPerSeed(sorted, 2, 3)), ["A1", "A2", "B1"]);
    });

    test("fill-up: if fewer than limit, skipped candidates are added at the end, in order", () => {
        assert.deepEqual(names(capPerSeed(sorted, 2, 7)), ["A1", "A2", "B1", "B2", "C1", "A3", "A4"]);
    });

    test("fill-up stops when nothing is left", () => {
        assert.equal(capPerSeed(sorted, 1, 100).length, sorted.length);
    });

    test("one seed only (cold start): fill-up returns up to limit", () => {
        const one = sortByScore([1, 2, 3, 4, 5, 6].map((i) => cand("X" + i, [["A", i / 10]])));
        assert.equal(capPerSeed(one, 3, 20).length, 6);
        assert.equal(capPerSeed(one, 3, 4).length, 4);
    });

    test("main seed = because[0].source, even when other seeds contribute too", () => {
        const input = sortByScore([
            cand("M1", [["Main", 0.9], ["Other", 0.1]]),
            cand("M2", [["Main", 0.8], ["Other", 0.1]]),
            cand("O1", [["Other", 0.5]])
        ]);
        assert.deepEqual(names(capPerSeed(input, 1, 2)), ["M1", "O1"]);
    });

    test("a seed with fewer than maxPerSeed is not padded", () => {
        assert.deepEqual(countBy(capPerSeed(sorted, 5, 8), (c) => c.because[0].source), { A: 5, B: 2, C: 1 });
    });

    test("malformed candidates and candidates without a main seed are skipped", () => {
        const result = capPerSeed([
            null, "X", { name: "NoBecause" },
            { name: "Empty", because: [] },
            { name: "BadMain", because: [null] },
            { name: "BlankMain", because: [{ source: "  ", contribution: 1 }] },
            cand("Good", [["A", 1]])
        ], 3, 20);
        assert.deepEqual(names(result), ["Good"]);
    });

    test("empty list → []", () => {
        assert.deepEqual(capPerSeed([], 3, 20), []);
    });

    test("does not modify its input", () => {
        const before = deepCopy(sorted);
        capPerSeed(sorted, 2, 5);
        assert.deepEqual(sorted, before);
    });
});

// ===========================================================================
// buildPool
// ===========================================================================

describe("buildPool", () => {

    for (const bad of BAD_ARRAYS) {
        test(`graph ${label(bad)} → TypeError`, () => {
            assert.throws(() => buildPool(bad, []), TypeError);
        });
        test(`knownArtists ${label(bad)} → TypeError`, () => {
            assert.throws(() => buildPool([], bad), TypeError);
        });
    }

    test("empty graph → []", () => {
        assert.deepEqual(buildPool([], []), []);
    });

    // A small realistic profile
    const graph = [
        seed("Noureddine Khourchid", 1, Array.from({ length: 15 }, (_, i) => ["Nasheed " + i, 1 - i * 0.05])),
        seed("MIA BOYKA", 0.5, [
            ["Zivert", 1], ["Клава Кока", 0.9], ["Юлианна Караулова", 0.8], ["5утра", 0.7],
            ["Seryabkina", 0.6], ["BTS, Halsey", 0.5], ["MIA BOYKA", 0.4], ["Jakone", 0.3], ["Mohito", 0.2]
        ]),
        seed("Lusia Chebotina", 1 / 3, [["Yulianna Karaulova", 1], ["Zivert", 0.9], ["Mohito", 0.5]]),
        seed("Soolking", 0.25, [["Khaled", 1], ["Rilès", 0.9]])
    ];
    const knownArtists = [
        { name: "Noureddine Khourchid", weight: 1 },
        { name: "MIA BOYKA", weight: 0.5 },
        { name: "Lusia Chebotina", weight: 1 / 3 },
        { name: "Soolking", weight: 0.25 },
        { name: "Klava Koka", weight: 0 },
        { name: "BTS", weight: 0 }
    ];
    const pool = buildPool(graph, knownArtists);

    test("known artists are gone (Layer 1 and Layer 2, weight 0 included)", () => {
        for (const n of ["MIA BOYKA", "Клава Кока"]) assert.ok(!names(pool).includes(n), `${n} should be removed`);
    });

    test("collaborations with a known artist are gone", () => {
        assert.ok(!names(pool).includes("BTS, Halsey"));
    });

    test("cross-script duplicates are merged into one candidate", () => {
        const karaulova = pool.filter((c) => /karaulova|караулова/i.test(c.name));
        assert.equal(karaulova.length, 1);
        assert.equal(karaulova[0].because.length, 2);
    });

    test("a candidate from several seeds collects all its reasons", () => {
        const zivert = pool.find((c) => c.name === "Zivert");
        assert.deepEqual(zivert.because.map((b) => b.source), ["MIA BOYKA", "Lusia Chebotina"]);
        close(zivert.score, 0.5 + 0.3);
    });

    test("at most 5 per main seed before fill-up, at most 40 in total", () => {
        assert.ok(pool.length <= 40);
        // The first part of the pool (before fill-up) respects the cap
        const firstPass = [];
        const seen = {};
        for (const c of pool) {
            const s = c.because[0].source;
            seen[s] = (seen[s] ?? 0) + 1;
            if (seen[s] <= 5) firstPass.push(c); else break;
        }
        assert.ok(countBy(firstPass, (c) => c.because[0].source)["Noureddine Khourchid"] <= 5);
    });

    test("small profile: fill-up takes everything that's left (here fewer than 40 exist)", () => {
        // 15 nasheed + Zivert, Юлианна, 5утра, Seryabkina, Jakone, Mohito, Khaled, Rilès = 23
        assert.equal(pool.length, 23);
    });

    test("every entry has score, sorted because, and a main seed", () => {
        for (const c of pool) {
            assert.equal(typeof c.score, "number");
            assert.ok(c.because.length >= 1);
            for (let i = 1; i < c.because.length; i++) {
                assert.ok(c.because[i - 1].contribution >= c.because[i].contribution);
            }
        }
    });

    test("does not modify its inputs", () => {
        const g = deepCopy(graph);
        const k = deepCopy(knownArtists);
        buildPool(g, k);
        assert.deepEqual(g, graph);
        assert.deepEqual(k, deepCopy(knownArtists));
    });
});

// ===========================================================================
// applyObscurity
// ===========================================================================

describe("applyObscurity: inputs", () => {

    const pool = [cand("X", [["A", 1]])];

    for (const bad of BAD_ARRAYS) {
        test(`pool ${label(bad)} → TypeError`, () => {
            assert.throws(() => applyObscurity(bad, {}, 0.5), TypeError);
        });
    }

    for (const bad of [undefined, null, [], "x", 42]) {
        test(`listeners ${label(bad)} → TypeError`, () => {
            assert.throws(() => applyObscurity(pool, bad, 0.5), TypeError);
        });
    }

    for (const bad of [null, -0.1, 1.1, NaN, Infinity, "0.5", {}]) {
        test(`strength ${label(bad)} → TypeError`, () => {
            assert.throws(() => applyObscurity(pool, {}, bad), TypeError);
        });
    }

    test("strength 0 and 1 are both allowed (inclusive bounds)", () => {
        assert.doesNotThrow(() => applyObscurity(pool, {}, 0));
        assert.doesNotThrow(() => applyObscurity(pool, {}, 1));
    });
});

describe("applyObscurity: formula", () => {

    // Scene A (median 1,000) and scene B (median 100,000), 3 counted each
    const pool = sortByScore([
        cand("a1", [["A", 0.9]]), cand("a2", [["A", 0.8]]), cand("a3", [["A", 0.7]]),
        cand("b1", [["B", 0.6]]), cand("b2", [["B", 0.5]]), cand("b3", [["B", 0.4]])
    ]);
    const listeners = { a1: 1000, a2: 1000, a3: 100, b1: 100000, b2: 100000, b3: 10000 };
    const byName = (list) => Object.fromEntries(list.map((c) => [c.name, c]));

    test("adds listeners and similarity; score = similarity × factor", () => {
        const r = byName(applyObscurity(pool, listeners, 0.5));
        assert.equal(r.a3.listeners, 100);
        close(r.a3.similarity, 0.7);
        close(r.a3.score, 0.7 * Math.sqrt(10), "a3");
    });

    test("strength 0: every score unchanged", () => {
        for (const c of applyObscurity(pool, listeners, 0)) close(c.score, c.similarity, c.name);
    });

    test("default strength is 0.5", () => {
        const r = byName(applyObscurity(pool, listeners));
        close(r.a3.score, 0.7 * Math.sqrt(10));
    });

    test("reference is per main seed: a typical artist of a big scene is NOT penalized", () => {
        const r = byName(applyObscurity(pool, listeners, 0.5));
        close(r.b1.score, 0.6, "b1 (median of its own scene)");
        close(r.a1.score, 0.9, "a1 (median of its own scene)");
    });

    test("10× less known than its scene → × 10^strength", () => {
        const r = byName(applyObscurity(pool, listeners, 0.5));
        close(r.b3.score, 0.4 * Math.sqrt(10), "b3");
    });

    test("more known than its scene → factor below 1", () => {
        const p = sortByScore([cand("c1", [["C", 0.5]]), cand("c2", [["C", 0.5]]), cand("c3", [["C", 0.5]])]);
        const r = byName(applyObscurity(p, { c1: 1000, c2: 1000, c3: 10000 }, 0.5));
        close(r.c3.score, 0.5 / Math.sqrt(10));
    });

    test("fewer than 3 counted candidates for a seed → pool median is used", () => {
        // Seed D has 2 counted candidates; pool median of all counts:
        // [1000, 1000, 1000, 4000, 4000] → 1000
        const p = sortByScore([
            cand("e1", [["E", 0.5]]), cand("e2", [["E", 0.5]]), cand("e3", [["E", 0.5]]),
            cand("d1", [["D", 0.5]]), cand("d2", [["D", 0.5]]), cand("dNull", [["D", 0.5]])
        ]);
        const r = byName(applyObscurity(p, { e1: 1000, e2: 1000, e3: 1000, d1: 4000, d2: 4000, dNull: null }, 1));
        close(r.d1.score, 0.5 * (1000 / 4000), "d1 uses the pool median, not its own (4000)");
    });

    test("only counted candidates make a scene: 3 candidates but 2 counts → pool median", () => {
        const p = sortByScore([
            cand("f1", [["F", 0.5]]), cand("f2", [["F", 0.5]]), cand("f3", [["F", 0.5]]),
            cand("g1", [["G", 0.5]]), cand("g2", [["G", 0.5]]), cand("g3", [["G", 0.5]])
        ]);
        const r = byName(applyObscurity(p, { f1: 100, f2: 100, f3: 100, g1: 400, g2: 400 }, 1));
        // pool counts [100, 100, 100, 400, 400] → median 100; g has 2 counts → pool median
        close(r.g1.score, 0.5 * (100 / 400));
    });

    test("clamped to at most 4", () => {
        const p = sortByScore([cand("h1", [["H", 0.5]]), cand("h2", [["H", 0.5]]), cand("h3", [["H", 0.5]])]);
        const r = byName(applyObscurity(p, { h1: 100000, h2: 100000, h3: 100 }, 1));
        close(r.h3.score, 0.5 * 4);
    });

    test("clamped to at least 0.25", () => {
        const p = sortByScore([cand("i1", [["I", 0.5]]), cand("i2", [["I", 0.5]]), cand("i3", [["I", 0.5]])]);
        const r = byName(applyObscurity(p, { i1: 100, i2: 100, i3: 100000 }, 1));
        close(r.i3.score, 0.5 * 0.25);
    });

    test("under 50 listeners: never boosted (duplicate or dead pages)", () => {
        const p = sortByScore([cand("j1", [["J", 0.5]]), cand("j2", [["J", 0.5]]), cand("j3", [["J", 0.5]])]);
        const r = byName(applyObscurity(p, { j1: 1000, j2: 1000, j3: 10 }, 1));
        close(r.j3.score, 0.5);
        assert.equal(r.j3.listeners, 10);
    });

    test("exactly 50 listeners can be boosted", () => {
        const p = sortByScore([cand("k1", [["K", 0.5]]), cand("k2", [["K", 0.5]]), cand("k3", [["K", 0.5]])]);
        const r = byName(applyObscurity(p, { k1: 100, k2: 100, k3: 50 }, 1));
        close(r.k3.score, 0.5 * 2);
    });

    test("under 50 listeners can still be penalized if the scene is even smaller", () => {
        const p = sortByScore([cand("l1", [["L", 0.5]]), cand("l2", [["L", 0.5]]), cand("l3", [["L", 0.5]])]);
        const r = byName(applyObscurity(p, { l1: 10, l2: 10, l3: 40 }, 1));
        close(r.l3.score, 0.5 * 0.25);
    });

    test("listeners 0 → factor 1 (no division by zero), listeners kept as 0", () => {
        const p = sortByScore([cand("m1", [["M", 0.5]]), cand("m2", [["M", 0.5]]), cand("m3", [["M", 0.5]])]);
        const r = byName(applyObscurity(p, { m1: 1000, m2: 1000, m3: 0 }, 1));
        close(r.m3.score, 0.5);
        assert.equal(r.m3.listeners, 0);
    });

    test("missing, null or non-number counts → factor 1 and listeners null", () => {
        const p = sortByScore([
            cand("n1", [["N", 0.5]]), cand("n2", [["N", 0.4]]), cand("n3", [["N", 0.3]]), cand("n4", [["N", 0.2]])
        ]);
        const r = byName(applyObscurity(p, { n1: null, n2: "500", n3: -5 }, 1));
        for (const n of ["n1", "n2", "n3", "n4"]) {
            assert.equal(r[n].listeners, null, n);
            close(r[n].score, r[n].similarity, n);
        }
    });

    test("names that look like JavaScript internals are ordinary names", () => {
        const p = sortByScore([cand("constructor", [["A", 0.5]]), cand("toString", [["A", 0.4]])]);
        const r = byName(applyObscurity(p, {}, 1));
        assert.equal(r.constructor.listeners, null);
        assert.equal(r.toString.listeners, null);
    });

    test("no counts at all → every factor 1, order unchanged", () => {
        const result = applyObscurity(pool, {}, 1);
        assert.deepEqual(names(result), names(pool));
        for (const c of result) close(c.score, c.similarity, c.name);
    });

    test("re-sorted by the new score", () => {
        const p = sortByScore([cand("Famous", [["A", 0.9]]), cand("Mid", [["A", 0.8]]), cand("Obscure", [["A", 0.5]])]);
        const result = applyObscurity(p, { Famous: 100000, Mid: 10000, Obscure: 100 }, 1);
        assert.equal(result[0].name, "Obscure");
    });

    test("ties broken by name", () => {
        const p = sortByScore([cand("Bravo", [["A", 0.5]]), cand("alpha", [["A", 0.5]])]);
        assert.deepEqual(names(applyObscurity(p, {}, 0.5)), ["alpha", "Bravo"]);
    });

    test("because and url are kept", () => {
        const [c] = applyObscurity([cand("X", [["A", 0.5], ["B", 0.1]])], {}, 0.5);
        assert.deepEqual(c.because.map((b) => b.source), ["A", "B"]);
        assert.equal(c.url, url("X"));
    });

    test("malformed candidates are skipped", () => {
        const result = applyObscurity([null, "X", { name: "" }, cand("Good", [["A", 1]])], {}, 0.5);
        assert.deepEqual(names(result), ["Good"]);
    });

    test("a candidate without a valid score is skipped (bad entries are skipped)", () => {
        const result = applyObscurity([
            { name: "NoScore", url: null, because: [{ source: "A", contribution: 1 }] },
            { name: "NaNScore", url: null, because: [{ source: "A", contribution: 1 }], score: NaN },
            cand("Good", [["A", 1]])
        ], {}, 0.5);
        assert.deepEqual(names(result), ["Good"]);
    });

    test("does not modify its input", () => {
        const before = deepCopy(pool);
        applyObscurity(pool, listeners, 1);
        assert.deepEqual(pool, before);
    });
});

// ===========================================================================
// toRecommendations
// ===========================================================================

describe("toRecommendations", () => {

    for (const bad of BAD_ARRAYS) {
        test(`candidates ${label(bad)} → TypeError`, () => {
            assert.throws(() => toRecommendations(bad), TypeError);
        });
    }

    const obscured = applyObscurity(sortByScore([
        cand("Seryabkina", [["MIA BOYKA", 0.193]]),
        cand("5утра", [["MIA BOYKA", 0.176], ["Amirchik", 0.013]])
    ]), { "Seryabkina": 2728, "5утра": 18009 }, 0.5);

    test("exact output shape: name, score, listeners, because, lastfmUrl", () => {
        for (const r of toRecommendations(obscured)) {
            assert.deepEqual(Object.keys(r).sort(), ["because", "lastfmUrl", "listeners", "name", "score"]);
        }
    });

    test("lastfmUrl is the candidate's url; internal fields are dropped", () => {
        const [r] = toRecommendations(obscured);
        assert.equal(r.lastfmUrl, url(r.name));
        assert.equal(r.similarity, undefined);
        assert.equal(r.url, undefined);
    });

    test("values are carried over unchanged, order kept", () => {
        const recs = toRecommendations(obscured);
        assert.deepEqual(names(recs), names(obscured));
        recs.forEach((r, i) => {
            assert.equal(r.score, obscured[i].score);
            assert.equal(r.listeners, obscured[i].listeners);
            assert.deepEqual(r.because, obscured[i].because);
        });
    });

    test("because items are copies with exactly source and contribution", () => {
        const recs = toRecommendations([{ ...cand("X", [["A", 1]]), because: [{ source: "A", contribution: 1, extra: "x" }] }]);
        assert.deepEqual(recs[0].because, [{ source: "A", contribution: 1 }]);
    });

    test("changing the output never changes the input", () => {
        const input = deepCopy(obscured);
        const recs = toRecommendations(input);
        recs[0].because[0].source = "CHANGED";
        recs[0].name = "CHANGED";
        assert.deepEqual(input, deepCopy(obscured));
    });

    test("malformed candidates are skipped", () => {
        assert.deepEqual(names(toRecommendations([null, "X", { name: "" }, { name: "NoBecause" }, cand("Good", [["A", 1]])])),
            ["Good"]);
    });

    test("output survives a JSON round trip (Chrome messaging)", () => {
        const recs = toRecommendations(obscured);
        assert.deepEqual(JSON.parse(JSON.stringify(recs)), recs);
    });

    test("empty list → []", () => {
        assert.deepEqual(toRecommendations([]), []);
    });
});

// ===========================================================================
// rankPool (end to end, pure)
// ===========================================================================

describe("rankPool", () => {

    const pool = sortByScore([
        ...[1, 2, 3, 4, 5].map((i) => cand("A" + i, [["A", 1 - i / 10]])),
        ...[1, 2, 3, 4, 5].map((i) => cand("B" + i, [["B", 0.5 - i / 100]])),
        ...[1, 2].map((i) => cand("C" + i, [["C", 0.2 - i / 100]]))
    ]);
    const listeners = Object.fromEntries(pool.map((c, i) => [c.name, 1000 * (i + 1)]));

    for (const bad of BAD_ARRAYS) {
        test(`pool ${label(bad)} → TypeError`, () => {
            assert.throws(() => rankPool(bad, {}, 0.5), TypeError);
        });
    }

    for (const bad of [null, [], "x"]) {
        test(`listeners ${label(bad)} → TypeError`, () => {
            assert.throws(() => rankPool(pool, bad, 0.5), TypeError);
        });
    }

    for (const bad of [-0.1, 1.1, NaN, "0.5"]) {
        test(`strength ${label(bad)} → TypeError`, () => {
            assert.throws(() => rankPool(pool, {}, bad), TypeError);
        });
    }

    test("returns recommendations in the final shape", () => {
        for (const r of rankPool(pool, listeners, 0.5)) {
            assert.deepEqual(Object.keys(r).sort(), ["because", "lastfmUrl", "listeners", "name", "score"]);
        }
    });

    test("at most 3 per main seed before fill-up", () => {
        const recs = rankPool(pool, listeners, 0);
        // 12 candidates < 20: the first 3 + 3 + 2 are capped, then the rest is filled up
        const firstEight = recs.slice(0, 8);
        assert.deepEqual(countBy(firstEight, (r) => r.because[0].source), { A: 3, B: 3, C: 2 });
        assert.equal(recs.length, 12);
    });

    test("at most 20 recommendations", () => {
        const big = sortByScore(Array.from({ length: 30 }, (_, i) => cand("S" + i, [["Seed" + (i % 10), 1 - i / 100]])));
        assert.equal(rankPool(big, {}, 0.5).length, 20);
    });

    test("with enough seeds, no seed has more than 3", () => {
        const big = sortByScore(Array.from({ length: 60 }, (_, i) => cand("S" + i, [["Seed" + (i % 10), 1 - i / 100]])));
        const counts = countBy(rankPool(big, {}, 0.5), (r) => r.because[0].source);
        for (const [s, n] of Object.entries(counts)) assert.ok(n <= 3, `${s}: ${n}`);
    });

    test("strength 0: same order as capPerSeed on the similarity order", () => {
        const expected = names(capPerSeed(pool, 3, 20));
        assert.deepEqual(names(rankPool(pool, listeners, 0)), expected);
    });

    test("strength changes which candidates of a seed are chosen", () => {
        // Seed A: the least-known candidate (A5) should get in at strength 1
        const l = { A1: 100000, A2: 100000, A3: 100000, A4: 100000, A5: 1000 };
        const at0 = names(rankPool(pool, l, 0)).slice(0, 8);
        const at1 = names(rankPool(pool, l, 1)).slice(0, 8);
        assert.ok(!at0.includes("A5"));
        assert.ok(at1.includes("A5"));
    });

    test("default strength = 0.5", () => {
        assert.deepEqual(rankPool(pool, listeners), rankPool(pool, listeners, 0.5));
    });

    test("empty pool → []", () => {
        assert.deepEqual(rankPool([], {}, 0.5), []);
    });

    test("buildPool → rankPool: output survives a JSON round trip", () => {
        const graph = [
            seed("MIA BOYKA", 1, [["Zivert", 1], ["Seryabkina", 0.6], ["5утра", 0.5]]),
            seed("Soolking", 0.5, [["Khaled", 1], ["Rilès", 0.9]])
        ];
        const p = buildPool(graph, [{ name: "MIA BOYKA", weight: 1 }, { name: "Soolking", weight: 0.5 }]);
        const recs = rankPool(p, { Zivert: 77596, Seryabkina: 2728, "5утра": 18009, Khaled: 397060, "Rilès": 118293 }, 0.5);
        assert.equal(recs.length, 5);
        assert.deepEqual(JSON.parse(JSON.stringify(recs)), recs);
    });

    test("does not modify its inputs", () => {
        const p = deepCopy(pool);
        const l = deepCopy(listeners);
        rankPool(p, l, 1);
        assert.deepEqual(p, deepCopy(pool));
        assert.deepEqual(l, listeners);
    });
});