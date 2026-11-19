// ─────────────────────────────────────────────────────────────────────────────
// Layer 2 of name matching: is this the same artist, written in two scripts?
//
//   isSameArtist("Клава Кока", "Klava Koka")        → true   (Cyrillic ↔ Latin)
//   isSameArtist("Δημήτρης Μητροπάνος", "Dimitris Mitropanos") → true (Greek)
//   isSameArtist("محمد عساف", "Mohammad Assaf")     → true   (Arabic ↔ Latin)
//   isSameArtist("Иван Дорн", "Monatik")             → false
//
// How it works, in three steps:
//
//   1. Layer 1 first: if normalizeArtist() gives the same key, it's a match.
//
//   2. Only names written in DIFFERENT scripts go further. Two Latin names
//      (or two Cyrillic names) that differ are treated as different artists:
//      that is what keeps false merges near zero.
//
//   3. Both names are turned into a rough Latin "comparison key", and the keys
//      are compared. The keys are never displayed or stored.
//        - Cyrillic, Greek, Armenian, Georgian → looseKey(): letter-by-letter
//          transliteration, then a few "folding" rules that erase the usual
//          spelling variants (kh/h, y/i/j, ts/c, double letters…).
//        - Arabic script (incl. Persian letters) → skeletonKey(): consonants
//          only, because Arabic doesn't write short vowels
//          (محمد = Mohammad = Muhammad = Mohamed = "mhmd").
//
// Supported: Latin ↔ Cyrillic (Russian, Ukrainian, Belarusian, Serbian,
// Macedonian, Bulgarian), Greek, Armenian, Georgian, Arabic, Persian.
// Not supported (always false unless Layer 1 matches): Chinese, Japanese,
// Korean, Thai, Hebrew and every other script.
//
// Safety guard: ONE-WORD NAMES NEVER MATCH in Layer 2. On real Last.fm data
// (32,000 names), one-word names merged different artists at every key
// length: Nanna ↔ На-На, Elkka ↔ Ёлка, Anastasia ↔ Анастасија,
// Wiktoria ↔ Виктория, Konstantin ↔ Константин, NOISEMAKER ↔ يونس ميكري.
// A single word is often a first name or a common word shared by artists in
// many countries, so the key alone can't tell them apart. The price: real
// one-word pairs (Ceca ↔ Цеца, Preslava ↔ Преслава, Монеточка ↔ Monetochka)
// are no longer matched. Zero false merges comes first.
//
// Folding rules start minimal. Add a rule only when a labeled pair needs it,
// then run `node --test` and experiments/layer2-check.mjs to make sure the
// number of false merges stays at zero.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeArtist } from "./normalize.js";

// Minimum key length for a match (multi-word names only, see above)
const MIN_KEY_LENGTH = 4;


// ── Writing system detection ────────────────────────────────────────────────

const SCRIPT_TESTS = [
    ["Latin", /\p{Script=Latin}/u],
    ["Cyrillic", /\p{Script=Cyrillic}/u],
    ["Greek", /\p{Script=Greek}/u],
    ["Armenian", /\p{Script=Armenian}/u],
    ["Georgian", /\p{Script=Georgian}/u],
    ["Arabic", /\p{Script=Arabic}/u],
];

// Main script of a name: the one with the most letters ("Other" if none we know)
function scriptOf(name)
{
    let best = "Other", bestCount = 0;
    for (const [script, test] of SCRIPT_TESTS)
    {
        const global = new RegExp(test.source, "gu");
        const count = (name.match(global) ?? []).length;
        if (count > bestCount) { best = script; bestCount = count; }
    }
    // A name made mostly of an unsupported script (Han, Hangul, Hebrew…) is "Other"
    const letters = (name.match(/\p{L}/gu) ?? []).length;
    return bestCount * 2 >= letters ? best : "Other";
}


// ── Letter tables ───────────────────────────────────────────────────────────

// Latin letters with diacritics that stand for a sound, not an accent.
// č → ch (not c) so that Serbian Чола (Čola) and Russian ч agree.
const LATIN_SPECIAL = {
    "č": "ch", "ć": "c", "š": "sh", "ž": "zh", "đ": "dj", "ð": "d", "þ": "th",
    "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "ı": "i",
};

// One table for all Cyrillic languages (Russian conventions where they differ)
const CYRILLIC = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
    // Ukrainian, Belarusian
    "є": "ye", "і": "i", "ї": "yi", "ґ": "g", "ў": "u",
    // Serbian, Macedonian
    "ђ": "dj", "ј": "j", "љ": "lj", "њ": "nj", "ћ": "c", "џ": "dzh", "ѓ": "gj", "ќ": "kj", "ѕ": "dz",
};

// Greek pairs of letters first, then single letters
const GREEK_PAIRS = [
    ["ου", "ou"], ["αι", "e"], ["ει", "i"], ["οι", "i"], ["υι", "i"],
    ["αυ", "av"], ["ευ", "ev"], ["γγ", "ng"],
];
const GREEK = {
    "α": "a", "β": "v", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "i", "θ": "th",
    "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "x", "ο": "o", "π": "p",
    "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "i", "φ": "f", "χ": "h", "ψ": "ps",
    "ω": "o",
};

// Eastern Armenian; ու is the vowel "u"
const ARMENIAN_PAIRS = [["ու", "u"]];
const ARMENIAN = {
    "ա": "a", "բ": "b", "գ": "g", "դ": "d", "ե": "e", "զ": "z", "է": "e", "ը": "e",
    "թ": "t", "ժ": "zh", "ի": "i", "լ": "l", "խ": "kh", "ծ": "ts", "կ": "k", "հ": "h",
    "ձ": "dz", "ղ": "gh", "ճ": "ch", "մ": "m", "յ": "y", "ն": "n", "շ": "sh", "ո": "o",
    "չ": "ch", "պ": "p", "ջ": "j", "ռ": "r", "ս": "s", "վ": "v", "տ": "t", "ր": "r",
    "ց": "ts", "ւ": "v", "փ": "p", "ք": "k", "օ": "o", "ֆ": "f", "և": "ev",
};

const GEORGIAN = {
    "ა": "a", "ბ": "b", "გ": "g", "დ": "d", "ე": "e", "ვ": "v", "ზ": "z", "თ": "t",
    "ი": "i", "კ": "k", "ლ": "l", "მ": "m", "ნ": "n", "ო": "o", "პ": "p", "ჟ": "zh",
    "რ": "r", "ს": "s", "ტ": "t", "უ": "u", "ფ": "p", "ქ": "k", "ღ": "gh", "ყ": "q",
    "შ": "sh", "ჩ": "ch", "ც": "ts", "ძ": "dz", "წ": "ts", "ჭ": "ch", "ხ": "kh",
    "ჯ": "j", "ჰ": "h",
};

// Arabic script → consonants only. Letters used as vowels (ا و ي ى),
// hamza forms, ʿayn and tāʾ marbūṭa (ة) disappear, like Latin vowels do.
const ARABIC = {
    "ب": "b", "ت": "t", "ث": "t", "ج": "j", "ح": "h", "خ": "h", "د": "d", "ذ": "z",
    "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z",
    "ع": "", "غ": "k", "ف": "f", "ق": "k", "ك": "k", "ل": "l", "م": "m", "ن": "n",
    "ه": "h", "ة": "", "و": "", "ي": "", "ى": "", "ا": "", "أ": "", "إ": "", "آ": "",
    "ء": "", "ئ": "", "ؤ": "", "ٱ": "",
    // Persian
    "پ": "p", "چ": "sh", "ژ": "zh", "گ": "k", "ک": "k", "ی": "",
};


// ── Helpers ─────────────────────────────────────────────────────────────────

function replacePairs(text, pairs)
{
    for (const [from, to] of pairs) text = text.split(from).join(to);
    return text;
}

function mapLetters(text, table)
{
    let out = "";
    for (const ch of text) out += table[ch] ?? ch;
    return out;
}

// Remove accents and other combining marks (é → e, ά → α, Arabic harakat)
const stripMarks = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");

// Every script → rough Latin, one word per space
function toLatin(name)
{
    let text = normalizeArtist(name);
    text = mapLetters(text, LATIN_SPECIAL);
    text = stripMarks(text);
    text = text.replace(/ـ/g, "");                         // Arabic tatweel (stretching)
    text = replacePairs(text, GREEK_PAIRS);
    text = replacePairs(text, ARMENIAN_PAIRS);
    text = mapLetters(text, { ...CYRILLIC, ...GREEK, ...ARMENIAN, ...GEORGIAN, ...ARABIC });
    return text.replace(/[^\p{L}\p{N}]+/gu, " ").trim();    // punctuation → space
}


// ── The two keys ────────────────────────────────────────────────────────────

// Cyrillic, Greek, Armenian, Georgian ↔ Latin
export function looseKey(name)
{
    let text = toLatin(name);

    // Greek word starts: Μπ, Ντ, Γκ are pronounced b, d, g (Μπακούλης = Bakoulis).
    // Applied to Latin names too, so "Mpaltzi" and "Baltzi" agree.
    text = text.replace(/\bmp/g, "b").replace(/\bnt/g, "d").replace(/\bgk/g, "g");

    // Folding: erase the usual transliteration variants
    text = replacePairs(text, [
        ["shch", "sh"], ["sch", "sh"],   // щ: shch / sch
        ["kh", "h"],                      // х: kh / h
        ["tz", "c"], ["ts", "c"],         // ц: ts / tz / c
        ["ks", "x"],                      // ξ: ks / x
        ["ph", "f"],                      // φ: ph / f
        ["w", "v"],                       // в: w (German style) / v
        ["y", "i"], ["j", "i"],           // й, ы, ј: y / i / j
    ]);
    text = text.replace(/ /g, "");
    return text.replace(/(.)\1+/g, "$1");                   // double letters: Anna → Ana
}

// Arabic script ↔ Latin: consonant skeleton
export function skeletonKey(name)
{
    let text = toLatin(name);
    text = replacePairs(text, [
        ["dj", "j"],                      // ج: dj (French) / j
        ["kh", "h"], ["gh", "k"],         // خ, غ
        ["ch", "sh"],                     // ش: ch (French) / sh
        ["th", "t"], ["dh", "z"],         // ث, ذ
        ["ph", "f"], ["x", "ks"],
        ["q", "k"], ["g", "k"], ["c", "k"],  // ق, غ, ك: q / g / k (Gulf, Egyptian)
    ]);
    text = text.replace(/[aeiouyw]/g, "");                 // Latin vowels (and w/y, often vowels in Arabic)
    text = text.split(" ").map((word) => word.replace(/h$/, "")).join("");  // final h: ة / ه (Abdullah, Fatimah)
    return text.replace(/(.)\1+/g, "$1");                   // Mohammad → mhmd
}


// ── The question Phase 5 asks ───────────────────────────────────────────────

const LOOSE_SCRIPTS = new Set(["Cyrillic", "Greek", "Armenian", "Georgian"]);

export function isSameArtist(a, b)
{
    // Layer 1
    const keyA = normalizeArtist(a);
    const keyB = normalizeArtist(b);
    if (keyA === keyB) return true;

    // Layer 2 only for one Latin name and one name in a supported other script
    const scriptA = scriptOf(keyA);
    const scriptB = scriptOf(keyB);
    if (scriptA === scriptB) return false;
    const other = scriptA === "Latin" ? scriptB : scriptB === "Latin" ? scriptA : null;
    if (other === null) return false;

    const useSkeleton = other === "Arabic";
    if (!useSkeleton && !LOOSE_SCRIPTS.has(other)) return false;

    // One-word names never match (see the guard note at the top)
    if (wordCount(keyA) < 2 || wordCount(keyB) < 2) return false;

    const looseA = useSkeleton ? skeletonKey(a) : looseKey(a);
    const looseB = useSkeleton ? skeletonKey(b) : looseKey(b);
    return looseA.length >= MIN_KEY_LENGTH && looseA === looseB;
}

const wordCount = (text) => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;