// Tests for extension/popup/format.js (the popup's pure helpers)
// Run from the repo root: node --test

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
    MODES, DEFAULT_MODE, modeById, modeText, formatListeners, becauseText,
    PHRASES, shufflePhrases, addArtist, explainError, spotifySearchUrl, rememberShown, nothingNew,
    TIME_RANGES, DEFAULT_TIME_RANGE, timeRangeById, TUTORIAL,
} from "../extension/popup/format.js";

// A seeded random generator, so shuffles are reproducible
function seeded(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe("modes", () => {

    test("three modes, strengths 0, 0.25, 0.5, all within the ranking's [0, 1]", () => {
        assert.deepEqual(MODES.map((m) => m.strength), [0, 0.25, 0.5]);
        for (const m of MODES) assert.ok(m.strength >= 0 && m.strength <= 1);
    });

    test("ids and labels are unique, every mode has a hint", () => {
        assert.equal(new Set(MODES.map((m) => m.id)).size, MODES.length);
        assert.equal(new Set(MODES.map((m) => m.label)).size, MODES.length);
        for (const m of MODES) assert.ok(m.hint.length > 0);
    });

    test("the default mode exists", () => {
        assert.ok(MODES.some((m) => m.id === DEFAULT_MODE));
    });

    test("modeById finds a mode, and falls back to the default for anything else", () => {
        assert.equal(modeById("familiar").strength, 0);
        for (const bad of [undefined, null, "", "nope", 42, {}]) {
            assert.equal(modeById(bad).id, DEFAULT_MODE);
        }
    });
});

describe("formatListeners", () => {

    const cases = [
        [0, "0 listeners"],
        [1, "1 listener"],
        [2, "2 listeners"],
        [950, "950 listeners"],
        [999, "999 listeners"],
        [1000, "1K listeners"],
        [1066, "1.1K listeners"],
        [2637, "2.6K listeners"],
        [9999, "10K listeners"],
        [30388, "30K listeners"],
        [397060, "397K listeners"],
        [1_000_000, "1M listeners"],
        [2_500_000, "2.5M listeners"],
        [5_000_000, "5M listeners"],
        [12_345_678, "12M listeners"],
    ];
    for (const [n, expected] of cases) {
        test(`${n} → "${expected}"`, () => assert.equal(formatListeners(n), expected));
    }

    test("unknown or invalid counts → empty string", () => {
        for (const bad of [null, undefined, NaN, Infinity, -1, "2637", {}]) {
            assert.equal(formatListeners(bad), "");
        }
    });
});

describe("becauseText", () => {

    const b = (...names) => names.map((source, i) => ({ source, contribution: 1 - i / 10 }));

    test("one reason", () => assert.equal(becauseText(b("MIA BOYKA")), "MIA BOYKA"));
    test("two reasons", () => assert.equal(becauseText(b("MIA BOYKA", "LOBODA")), "MIA BOYKA and LOBODA"));
    test("more than the max → \"and N more\"", () => {
        assert.equal(becauseText(b("A", "B", "C", "D")), "A, B and 2 more");
        assert.equal(becauseText(b("A", "B", "C")), "A, B and 1 more");
    });
    test("a larger max shows more names", () => {
        assert.equal(becauseText(b("A", "B", "C"), 3), "A, B and C");
    });
    test("keeps the order given (biggest contribution first)", () => {
        assert.equal(becauseText(b("Second", "First")), "Second and First");
    });
    test("non-Latin names are kept as they are", () => {
        assert.equal(becauseText(b("Татьяна Куртукова", "عمرو دياب")), "Татьяна Куртукова and عمرو دياب");
    });
    test("bad entries are skipped, not printed", () => {
        assert.equal(becauseText([null, { source: "" }, { contribution: 1 }, { source: "  A  " }]), "A");
    });
    test("nothing usable → empty string", () => {
        for (const bad of [[], null, undefined, "A", [{}]]) assert.equal(becauseText(bad), "");
    });
});

describe("shufflePhrases", () => {

    test("wrong input type → TypeError", () => {
        for (const bad of [null, undefined, "phrase", 42]) assert.throws(() => shufflePhrases(bad), TypeError);
    });

    test("returns every phrase exactly once", () => {
        const out = shufflePhrases(PHRASES, null, seeded(1));
        assert.deepEqual([...out].sort(), [...PHRASES].sort());
    });

    test("does not modify the input", () => {
        const input = [...PHRASES];
        shufflePhrases(input, null, seeded(2));
        assert.deepEqual(input, PHRASES);
    });

    test("never starts with the phrase the last run started with", () => {
        for (let seed = 0; seed < 200; seed++) {
            const last = PHRASES[seed % PHRASES.length];
            assert.notEqual(shufflePhrases(PHRASES, last, seeded(seed))[0], last, `seed ${seed}`);
        }
    });

    test("different runs give different orders", () => {
        const orders = new Set(Array.from({ length: 20 }, (_, i) => shufflePhrases(PHRASES, null, seeded(i)).join("|")));
        assert.ok(orders.size > 15);
    });

    test("one phrase or none: no crash", () => {
        assert.deepEqual(shufflePhrases(["Only"], "Only"), ["Only"]);
        assert.deepEqual(shufflePhrases([]), []);
    });

    test("empty or non-string phrases are dropped", () => {
        assert.deepEqual(shufflePhrases(["A", "", "  ", null, 5], null, seeded(3)), ["A"]);
    });

    test("there are enough phrases for a 15-second wait", () => {
        assert.ok(PHRASES.length >= 8);
        for (const p of PHRASES) assert.ok(p.length <= 60, `too long for the popup: "${p}"`);
    });
});

describe("addArtist", () => {

    test("adds a trimmed name at the end", () => {
        assert.deepEqual(addArtist(["Soolking"], "  Клава Кока  "), ["Soolking", "Клава Кока"]);
    });

    test("never splits on commas", () => {
        assert.deepEqual(addArtist([], "Tyler, The Creator"), ["Tyler, The Creator"]);
    });

    test("collapses inner runs of spaces", () => {
        assert.deepEqual(addArtist([], "Massive    Attack"), ["Massive Attack"]);
    });

    test("ignores duplicates (case and spaces don't matter)", () => {
        assert.deepEqual(addArtist(["Radiohead"], " RADIOHEAD "), ["Radiohead"]);
    });

    test("ignores empty input", () => {
        for (const bad of ["", "   ", "\n", null, undefined, 42]) assert.deepEqual(addArtist(["A"], bad), ["A"]);
    });

    test("bad list → treated as empty; non-strings in the list are dropped", () => {
        assert.deepEqual(addArtist(null, "A"), ["A"]);
        assert.deepEqual(addArtist(["A", 5, null], "B"), ["A", "B"]);
    });

    test("does not modify the input list", () => {
        const list = ["A"];
        addArtist(list, "B");
        assert.deepEqual(list, ["A"]);
    });
});

describe("explainError", () => {

    test("no message → the background didn't answer", () => {
        for (const m of ["", null, undefined]) assert.match(explainError(m), /didn't answer/);
    });

    test("not logged in → connect Spotify", () => {
        assert.match(explainError("NOT_LOGGED_IN"), /Connect Spotify/);
    });

    test("Spotify 403 → the invite list", () => {
        assert.match(explainError("Spotify 403 Forbidden"), /invite list/);
    });

    test("Spotify 401 → session expired", () => {
        assert.match(explainError("Spotify 401"), /expired/);
    });

    test("network → check your connection", () => {
        for (const m of ["NETWORK: fetch failed", "Failed to fetch"]) assert.match(explainError(m), /connection/);
    });

    test("rate limit → wait", () => {
        assert.match(explainError("29: Rate limit exceeded"), /Wait a minute/);
    });

    test("anything else → the message, and what to do", () => {
        const text = explainError("Something odd");
        assert.match(text, /Something odd/);
        assert.match(text, /Try again/);
    });
});

describe("spotifySearchUrl", () => {
    const BASE = "https://open.spotify.com/search/";

    test("a name → Spotify's artist search for it", () => {
        assert.equal(spotifySearchUrl("Soolking"), BASE + "Soolking/artists");
    });

    test("spaces are encoded", () => {
        assert.equal(spotifySearchUrl("Haris Alexiou"), BASE + "Haris%20Alexiou/artists");
    });

    test("trimmed, inner runs of spaces collapsed", () => {
        assert.equal(spotifySearchUrl("  Haris   Alexiou "), BASE + "Haris%20Alexiou/artists");
    });

    test("characters that would break the path are encoded (/ & ? # % +)", () => {
        for (const name of ["AC/DC", "Simon & Garfunkel", "Who? = Me", "C# Major", "100% Pure", "Florence + the Machine"]) {
            const url = spotifySearchUrl(name);
            const query = url.slice(BASE.length, -"/artists".length);
            assert.ok(!/[/&?#+ ]/.test(query), `${name} → ${url}`);
            assert.equal(decodeURIComponent(query), name);
        }
    });

    test("non-Latin names survive the round trip", () => {
        for (const name of ["Клава Кока", "فيروز", "宇多田ヒカル", "Χάρις Αλεξίου"]) {
            const url = spotifySearchUrl(name);
            assert.ok(url.startsWith(BASE) && url.endsWith("/artists"));
            assert.equal(decodeURIComponent(url.slice(BASE.length, -"/artists".length)), name);
        }
    });

    test("it is a valid https URL on open.spotify.com", () => {
        const url = new URL(spotifySearchUrl("Tyler, The Creator"));
        assert.equal(url.protocol, "https:");
        assert.equal(url.hostname, "open.spotify.com");
    });

    test("empty, blank or non-string → null (no link)", () => {
        for (const bad of ["", "   ", "\t\n", null, undefined, 42, {}, []]) {
            assert.equal(spotifySearchUrl(bad), null);
        }
    });
});

describe("rememberShown", () => {
    const recs = (...names) => names.map((name) => ({ name, score: 1, listeners: 10, because: [], lastfmUrl: null }));

    test("wrong input types → TypeError", () => {
        for (const bad of [null, undefined, "A", 42, {}]) {
            assert.throws(() => rememberShown(bad, []), TypeError);
            assert.throws(() => rememberShown([], bad), TypeError);
        }
    });

    test("first batch: the names, in order", () => {
        assert.deepEqual(rememberShown([], recs("A", "B", "C")), ["A", "B", "C"]);
    });

    test("next batch is added after what was already shown", () => {
        assert.deepEqual(rememberShown(["A", "B"], recs("C", "D")), ["A", "B", "C", "D"]);
    });

    test("duplicates kept once, first spelling (case and outer spaces don't matter)", () => {
        assert.deepEqual(rememberShown(["Soolking"], recs(" soolking ", "Haris Alexiou", "HARIS ALEXIOU")),
            ["Soolking", "Haris Alexiou"]);
    });

    test("non-Latin names are kept as they are", () => {
        assert.deepEqual(rememberShown([], recs("Клава Кока", "فيروز")), ["Клава Кока", "فيروز"]);
    });

    test("bad entries are skipped", () => {
        const mixed = [null, 42, {}, { name: "" }, { name: "   " }, { name: 7 }, { name: "Ok" }];
        assert.deepEqual(rememberShown(["", null, "X"], mixed), ["X", "Ok"]);
    });

    test("does not modify its inputs", () => {
        const shown = ["A"]; const batch = recs("B");
        const copy = structuredClone(batch);
        rememberShown(shown, batch);
        assert.deepEqual(shown, ["A"]);
        assert.deepEqual(batch, copy);
    });
});

describe("nothingNew", () => {
    const recs = (...names) => names.map((name) => ({ name }));

    test("wrong input types → TypeError", () => {
        for (const bad of [null, undefined, "A", 42, {}]) {
            assert.throws(() => nothingNew(bad, []), TypeError);
            assert.throws(() => nothingNew([], bad), TypeError);
        }
    });

    test("empty batch → true (the pool is used up)", () => {
        assert.equal(nothingNew(["A"], []), true);
        assert.equal(nothingNew([], []), true);
    });

    test("one new name is enough → false", () => {
        assert.equal(nothingNew(["A", "B"], recs("A", "C")), false);
    });

    test("every name already shown → true (same list came back)", () => {
        assert.equal(nothingNew(["A", "B"], recs("b", " A ")), true);
    });

    test("bad entries don't count as new", () => {
        assert.equal(nothingNew(["A"], [null, { name: "" }, { name: 3 }, recs("A")[0]]), true);
    });
});

describe("Spotify history (time ranges)", () => {

    test("exactly Spotify's three values, in order from shortest to longest", () => {
        assert.deepEqual(TIME_RANGES.map((r) => r.id), ["short_term", "medium_term", "long_term"]);
    });

    test("labels and hints are unique and non-empty", () => {
        for (const key of ["label", "hint"]) {
            const values = TIME_RANGES.map((r) => r[key]);
            assert.ok(values.every((v) => typeof v === "string" && v.trim() !== ""));
            assert.equal(new Set(values).size, values.length);
        }
    });

    test("the default is Spotify's default (medium_term)", () => {
        assert.equal(DEFAULT_TIME_RANGE, "medium_term");
        assert.ok(TIME_RANGES.some((r) => r.id === DEFAULT_TIME_RANGE));
    });

    test("timeRangeById finds a range, and falls back to the default for anything else", () => {
        assert.equal(timeRangeById("long_term").id, "long_term");
        for (const bad of [undefined, null, "", "all_time", 42, {}, "LONG_TERM"]) {
            assert.equal(timeRangeById(bad).id, DEFAULT_TIME_RANGE);
        }
    });
});

describe("tutorial", () => {
    const all = () => TUTORIAL.map((s) => `${s.title} ${s.body}`).join(" ");

    test("3 to 6 steps, each with a title and a body", () => {
        assert.ok(TUTORIAL.length >= 3 && TUTORIAL.length <= 6);
        for (const step of TUTORIAL) {
            assert.ok(typeof step.title === "string" && step.title.trim() !== "");
            assert.ok(typeof step.body === "string" && step.body.trim() !== "");
        }
    });

    test("titles are unique", () => {
        assert.equal(new Set(TUTORIAL.map((s) => s.title)).size, TUTORIAL.length);
    });

    test("names every mode by its button labels, Spotify and typed (stays in sync if a label changes)", () => {
        for (const mode of MODES) {
            for (const source of ["spotify", "typed"]) {
                const { label } = modeText(mode, source);
                assert.ok(all().includes(label), label);
            }
        }
    });

    test("names every history range by its button label", () => {
        for (const range of TIME_RANGES) assert.ok(all().includes(range.label), range.label);
    });

    test("explains both sources and the result links", () => {
        for (const word of ["Spotify", "Type", "Last.fm", "Show me others", "invite-only"]) assert.ok(all().includes(word), word);
    });

    test("the first step says it's a tutorial, that it can be skipped, and how to come back", () => {
        const first = TUTORIAL[0].body;
        for (const word of ["tutorial", "skip", "Tutorial button"]) assert.ok(first.includes(word), word);
    });

    test("each body fits the popup: under 220 characters", () => {
        for (const step of TUTORIAL) assert.ok(step.body.length < 220, `${step.title}: ${step.body.length}`);
    });
});

describe("modeText", () => {
    const familiar = MODES.find((m) => m.id === "familiar");

    test("Familiar with Spotify, Popular with typed artists", () => {
        assert.equal(modeText(familiar, "spotify").label, "Familiar");
        assert.equal(modeText(familiar, "typed").label, "Popular");
    });

    test("the typed hint doesn't talk about what you play", () => {
        assert.doesNotMatch(modeText(familiar, "typed").hint, /play/);
        assert.equal(modeText(familiar, "spotify").hint, familiar.hint);
    });

    test("modes without a typed label keep the same text for both sources", () => {
        for (const mode of MODES.filter((m) => !m.labelTyped)) {
            assert.deepEqual(modeText(mode, "typed"), modeText(mode, "spotify"));
            assert.equal(modeText(mode, "typed").label, mode.label);
        }
    });

    test("labels stay unique within each source", () => {
        for (const source of ["spotify", "typed"]) {
            const labels = MODES.map((m) => modeText(m, source).label);
            assert.equal(new Set(labels).size, labels.length);
        }
    });

    test("an unknown source falls back to the Spotify text", () => {
        assert.equal(modeText(familiar, undefined).label, "Familiar");
    });
});
