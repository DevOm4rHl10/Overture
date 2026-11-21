// Tests for shared/normalize.js and sources/seeds.js
// Run from the repo root: node --test
//
// Groups:
//   1. Core behavior          - what must always work
//   2. Whitespace & invisible - pasted text from web pages, files, phones
//   3. Unicode & case         - accents, full-width, non-Latin scripts
//   4. Must stay separate     - different artists that must never merge
//   5. Real artist names      - symbols, punctuation, commas
//   6. Robustness             - bad input from the popup or other sources
//   7. Known limitations      - current behavior, documented on purpose.
//                               When you improve normalize.js, flip these.
//   8. Seeds adapter          - the [{ name, weight }] contract
//   9. Decisions pending      - marked "todo": reported, but don't fail

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { normalizeArtist, normalizeArtistList } from "../extension/shared/normalize.js";
import { loadArtists } from "../extension/sources/seeds.js";

// Helpers: "these names are the same artist" / "these are different artists"
const same = (a, b) => assert.equal(normalizeArtist(a), normalizeArtist(b), `expected "${a}" and "${b}" to merge`);
const different = (a, b) => assert.notEqual(normalizeArtist(a), normalizeArtist(b), `expected "${a}" and "${b}" to stay separate`);


// ─────────────────────────────────────────────────────────────
// 1. Core behavior
// ─────────────────────────────────────────────────────────────
describe("Core behavior", () =>
{
    test("removes case-insensitive duplicates", () =>
    {
        const result = normalizeArtistList(["Radiohead", "RADIOHEAD", "Nirvana", "  NIRVANA  ", "Pink Floyd"]);
        assert.deepEqual(result, ["Radiohead", "Nirvana", "Pink Floyd"]);
    });

    test("keeps the first spelling encountered", () =>
    {
        assert.deepEqual(normalizeArtistList(["Radiohead", "RADIOHEAD", "radiohead"]), ["Radiohead"]);
        assert.deepEqual(normalizeArtistList(["radiohead", "Radiohead"]), ["radiohead"]);
    });

    test("keeps the order of first appearance", () =>
    {
        const result = normalizeArtistList(["C", "A", "b", "a", "B", "c"]);
        assert.deepEqual(result, ["C", "A", "b"]);
    });

    test("returns trimmed display names, not normalized keys", () =>
    {
        assert.deepEqual(normalizeArtistList(["  Tyler, The Creator  "]), ["Tyler, The Creator"]);
    });

    test("does not modify the input array", () =>
    {
        const input = ["  Radiohead ", "RADIOHEAD", null];
        const copy = [...input];
        normalizeArtistList(input);
        assert.deepEqual(input, copy);
    });

    test("normalizeArtist returns a lowercase, trimmed key", () =>
    {
        assert.equal(normalizeArtist("  Radiohead  "), "radiohead");
    });

    test("normalizeArtist is idempotent (normalizing a key changes nothing)", () =>
    {
        for (const name of ["Radiohead", "ＢＥＹＯＮＣＥ", "Beyoncé", "Толстой", "فيروز", "ΒΑΓΓΕΛΗΣ"])
        {
            const key = normalizeArtist(name);
            assert.equal(normalizeArtist(key), key, `not idempotent for "${name}"`);
        }
    });
});


// ─────────────────────────────────────────────────────────────
// 2. Whitespace and invisible characters
// ─────────────────────────────────────────────────────────────
describe("Whitespace and invisible characters", () =>
{
    test("tabs and newlines around a name", () => same("\tRadiohead\n", "Radiohead"));

    test("Windows line ending (\\r\\n) from pasted text", () => same("Radiohead\r\n", "Radiohead"));

    test("non-breaking space (common when copying from web pages)", () => same("Radiohead ", "Radiohead"));

    test("byte-order mark (common at the start of files)", () => same("﻿Radiohead", "Radiohead"));

    test("ideographic space (Japanese/Chinese keyboards)", () => same("　Radiohead　", "Radiohead"));

    test("spaces inside a name are kept as typed", () =>
    {
        assert.deepEqual(normalizeArtistList(["Pink Floyd"]), ["Pink Floyd"]);
    });

    test("whitespace-only entries of every kind are dropped", () =>
    {
        const result = normalizeArtistList(["", " ", "\t", "\n", "\r\n", " ", "　", "﻿"]);
        assert.deepEqual(result, []);
    });
});


// ─────────────────────────────────────────────────────────────
// 3. Unicode forms and case
// ─────────────────────────────────────────────────────────────
describe("Unicode forms and case", () =>
{
    test("composed vs decomposed accent (é as one char vs e + accent)", () =>
        same("Beyoncé", "Beyoncé"));

    test("composed vs decomposed in the list keeps one entry", () =>
    {
        assert.deepEqual(normalizeArtistList(["Beyoncé", "Beyoncé"]), ["Beyoncé"]);
    });

    test("full-width Latin (Japanese keyboards)", () => same("ＲＡＤＩＯＨＥＡＤ", "Radiohead"));

    test("half-width katakana", () => same("ﾋｶﾙ", "ヒカル"));

    test("Cyrillic case", () =>
    {
        const result = normalizeArtistList(["Толстой", "толстой", "ДОСТОЕВСКИЙ", "Достоевский"]);
        assert.deepEqual(result, ["Толстой", "ДОСТОЕВСКИЙ"]);
    });

    test("Greek case, including final sigma", () => same("ΒΑΓΓΕΛΗΣ", "Βαγγελης"));

    test("Arabic names merge only with surrounding whitespace removed", () =>
    {
        const result = normalizeArtistList(["فيروز", "  فيروز  ", "أم كلثوم"]);
        assert.deepEqual(result, ["فيروز", "أم كلثوم"]);
    });

    test("Hebrew, Devanagari, Thai, Korean and Chinese names are kept", () =>
    {
        const names = ["אריק איינשטיין", "लता मंगेशकर", "เบิร์ด ธงไชย", "아이유", "周杰伦"];
        assert.deepEqual(normalizeArtistList(names), names);
    });

    test("one name mixing two scripts stays one entry", () =>
    {
        assert.deepEqual(normalizeArtistList(["Fairuz فيروز"]), ["Fairuz فيروز"]);
    });
});


// ─────────────────────────────────────────────────────────────
// 4. Different artists that must never merge
// ─────────────────────────────────────────────────────────────
describe("Must stay separate", () =>
{
    test("one name is a prefix of the other", () => different("Air", "Air Supply"));

    test("'The The' is a real band, not 'The'", () => different("The The", "The"));

    test("similar but not equal", () => different("Sia", "Sia Furler"));

    test("one letter apart", () => different("Bjork", "Bjorn"));

    test("same letters, different spacing", () => different("Blink 182", "Blink182"));

    test("all of them survive in a list", () =>
    {
        const names = ["Air", "Air Supply", "The The", "Sia", "Sia Furler"];
        assert.deepEqual(normalizeArtistList(names), names);
    });
});


// ─────────────────────────────────────────────────────────────
// 5. Real artist names with symbols and punctuation
// ─────────────────────────────────────────────────────────────
describe("Real artist names", () =>
{
    test("commas inside a name never split it", () =>
    {
        assert.deepEqual(normalizeArtistList(["Tyler, The Creator", "Crosby, Stills, Nash & Young"]),
            ["Tyler, The Creator", "Crosby, Stills, Nash & Young"]);
    });

    test("names made only of symbols are not treated as empty", () =>
    {
        assert.deepEqual(normalizeArtistList(["!!!", "$uicideboy$", "+44", "†††"]),
            ["!!!", "$uicideboy$", "+44", "†††"]);
    });

    test("accented and special-letter names are kept as typed", () =>
    {
        assert.deepEqual(normalizeArtistList(["múm", "Sigur Rós", "Motörhead", "Mø"]),
            ["múm", "Sigur Rós", "Motörhead", "Mø"]);
    });

    test("numeric names stay strings", () =>
    {
        assert.deepEqual(normalizeArtistList(["112", "50 Cent"]), ["112", "50 Cent"]);
    });

    test("emoji in names are kept", () =>
    {
        assert.deepEqual(normalizeArtistList(["🎹 Pianist"]), ["🎹 Pianist"]);
    });

    test("names that look like JavaScript internals are ordinary names", () =>
    {
        // Would break if the list helper ever switched from Map to a plain object
        const names = ["__proto__", "constructor", "toString", "hasOwnProperty"];
        assert.deepEqual(normalizeArtistList(names), names);
    });

    test("a very long name is kept unchanged", () =>
    {
        const longName = "A".repeat(500);
        assert.deepEqual(normalizeArtistList([longName]), [longName]);
    });
});


// ─────────────────────────────────────────────────────────────
// 6. Robustness: bad entries inside the array
// ─────────────────────────────────────────────────────────────
describe("Robustness", () =>
{
    test("skips non-string entries", () =>
    {
        const result = normalizeArtistList(["Radiohead", null, undefined, 42, NaN, true, {}, ["Nirvana"], () => "x", "Nirvana"]);
        assert.deepEqual(result, ["Radiohead", "Nirvana"]);
    });

    test("skips String objects (typeof 'object')", () =>
    {
        // eslint-disable-next-line no-new-wrappers
        assert.deepEqual(normalizeArtistList([new String("Radiohead"), "Nirvana"]), ["Nirvana"]);
    });

    test("handles sparse arrays (holes)", () =>
    {
        const sparse = ["Radiohead", , "Nirvana"]; // eslint-disable-line no-sparse-arrays
        assert.deepEqual(normalizeArtistList(sparse), ["Radiohead", "Nirvana"]);
    });

    test("empty list returns an empty array", () =>
    {
        assert.deepEqual(normalizeArtistList([]), []);
    });

    test("list with only invalid entries returns an empty array", () =>
    {
        assert.deepEqual(normalizeArtistList(["", "   ", null, 7]), []);
    });

    test("a broken character (lone surrogate) does not crash", () =>
    {
        assert.doesNotThrow(() => normalizeArtistList(["Radio\uD800head"]));
    });

    test("10,000 names with heavy duplication: correct and fast", () =>
    {
        const names = [];
        for (let i = 0; i < 10000; i++) names.push(i % 2 ? `Artist ${i % 500}` : `ARTIST ${i % 500}`);

        const start = performance.now();
        const result = normalizeArtistList(names);
        const ms = performance.now() - start;

        assert.equal(result.length, 500);
        assert.ok(ms < 200, `took ${ms.toFixed(1)} ms`);
    });
});


// ─────────────────────────────────────────────────────────────
// 7. Known limitations (current behavior, on purpose)
//    Each of these SHOULD ideally merge. Today they don't.
//    When you fix one in normalize.js, change different() to same().
// ─────────────────────────────────────────────────────────────
describe("Known limitations", () =>
{
    // Accents and case folding
    test("accents are not stripped", () => different("Beyoncé", "Beyonce"));
    test("Turkish dotted İ lowercases to two characters", () => different("İlhan", "ilhan"));
    test("German ß is not case-folded", () => different("STRASSE", "straße"));

    // Punctuation and naming variants
    test("curly vs straight apostrophe (phones insert curly ones)", () => different("Guns N’ Roses", "Guns N' Roses"));
    test("leading 'The' is kept", () => different("The Beatles", "Beatles"));
    test("'&' vs 'and'", () => different("Simon & Garfunkel", "Simon and Garfunkel"));
    test("punctuation is kept", () => different("AC/DC", "ACDC"));
    test("double spaces inside a name are kept", () => different("Pink  Floyd", "Pink Floyd"));

    // Invisible characters that trim() and NFKC don't remove
    test("zero-width space", () => different("Radio​head", "Radiohead"));
    test("zero-width joiner", () => different("Radio‍head", "Radiohead"));
    test("right-to-left mark (copied Arabic/Hebrew text)", () => different("‏فيروز", "فيروز"));
    test("left-to-right mark", () => different("‎Radiohead", "Radiohead"));

    // Arabic-specific
    test("tashkeel (diacritics) is kept", () => different("مُحَمَّد", "محمد"));
    test("alef variants are not unified", () => different("أحمد", "احمد"));
    test("tatweel (stretching) is kept", () => different("عمــرو", "عمرو"));
    test("taa marbuta vs haa", () => different("فرقة", "فرقه"));
    test("alef maqsura vs yaa", () => different("مصطفى", "مصطفي"));

    // Cross-script (the postponed problem)
    test("Arabic vs Latin transliteration", () => different("فيروز", "Fairuz"));
    test("Cyrillic vs Latin transliteration", () => different("Кино", "Kino"));
    test("Japanese vs romaji", () => different("宇多田ヒカル", "Utada Hikaru"));
    test("Korean vs English name", () => different("방탄소년단", "BTS"));
});


// ─────────────────────────────────────────────────────────────
// 8. Seeds adapter: the [{ name, weight }] contract
// ─────────────────────────────────────────────────────────────
describe("Seeds adapter (loadArtists)", () =>
{
    test("returns a Promise (same interface as the other adapters)", () =>
    {
        assert.ok(loadArtists(["Radiohead"]) instanceof Promise);
    });

    test("assigns weight 1 to every unique artist, first spelling, input order", async () =>
    {
        const result = await loadArtists(["Radiohead", "RADIOHEAD", "Nirvana"]);
        assert.deepEqual(result, [
            { name: "Radiohead", weight: 1 },
            { name: "Nirvana", weight: 1 },
        ]);
    });

    test("every entry has exactly the keys name and weight", async () =>
    {
        const result = await loadArtists(["Radiohead", "Nirvana"]);
        for (const entry of result)
        {
            assert.deepEqual(Object.keys(entry).sort(), ["name", "weight"]);
            assert.equal(typeof entry.name, "string");
            assert.equal(typeof entry.weight, "number");
            assert.ok(Number.isFinite(entry.weight));
        }
    });

    test("empty or all-invalid input returns []", async () =>
    {
        assert.deepEqual(await loadArtists([]), []);
        assert.deepEqual(await loadArtists(["", "  ", null]), []);
    });

    test("output survives Chrome messaging (JSON round trip)", async () =>
    {
        // chrome.runtime messages only carry plain JSON-like data
        const result = await loadArtists(["Radiohead", "فيروز", "Толстой"]);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    });

    test("handles a realistic messy paste from the popup", async () =>
    {
        const result = await loadArtists([
            "  Radiohead\n",
            "radiohead",
            "﻿فيروز",
            "Tyler, The Creator",
            "",
            "ＲＡＤＩＯＨＥＡＤ",
            "Beyoncé",
            "Beyoncé",
        ]);
        assert.deepEqual(result, [
            { name: "Radiohead", weight: 1 },
            { name: "فيروز", weight: 1 },
            { name: "Tyler, The Creator", weight: 1 },
            { name: "Beyoncé", weight: 1 },
        ]);
    });
});


// ─────────────────────────────────────────────────────────────
// 9. Wrong input type: refuse, don't run
//    Decision: a wrong top-level input type throws a TypeError whose
//    message names the expected type. Bad entries INSIDE a valid
//    array are still skipped (see "Robustness").
// ─────────────────────────────────────────────────────────────
const expectsArray = { name: "TypeError", message: /array/i };
const expectsString = { name: "TypeError", message: /string/i };

describe("Wrong input type is refused", () =>
{
    test("normalizeArtistList: null, undefined, numbers and booleans", () =>
    {
        for (const bad of [null, undefined, 42, NaN, true])
        {
            assert.throws(() => normalizeArtistList(bad), expectsArray, `accepted ${String(bad)}`);
        }
    });

    test("normalizeArtistList: a single string is not split into letters", () =>
    {
        assert.throws(() => normalizeArtistList("Radiohead"), expectsArray);
        assert.throws(() => normalizeArtistList(""), expectsArray);
    });

    test("normalizeArtistList: array-like objects are not arrays", () =>
    {
        // Has .length and indexes, so a plain for-loop would happily iterate it
        assert.throws(() => normalizeArtistList({ length: 2, 0: "Radiohead", 1: "Nirvana" }), expectsArray);
        assert.throws(() => normalizeArtistList(new Set(["Radiohead"])), expectsArray);
        assert.throws(() => normalizeArtistList({}), expectsArray);
    });

    test("normalizeArtist: null, undefined, numbers, arrays and objects", () =>
    {
        for (const bad of [null, undefined, 42, true, ["Radiohead"], {}])
        {
            assert.throws(() => normalizeArtist(bad), expectsString, `accepted ${JSON.stringify(bad)}`);
        }
    });

    test("loadArtists rejects (does not resolve) on a wrong input type", async () =>
    {
        // Async function: the error arrives as a rejected Promise, not a sync throw
        await assert.rejects(loadArtists(null), expectsArray);
        await assert.rejects(loadArtists("Radiohead"), expectsArray);
    });
});