// Pure helpers for the popup: no DOM, no chrome.*, so they are unit-tested
// in tests/popup-format.test.js.

import { normalizeArtist } from "../shared/normalize.js";

// ── Discovery modes (what the three buttons send to the ranking) ────────────

export const MODES = [
    // With typed artists Overture doesn't know what you play, so this mode is "Popular" there.
    { id: "familiar", label: "Familiar", labelTyped: "Popular", strength: 0,
      hint: "Close to what you already play.", hintTyped: "The best-known artists near the ones you typed." },
    { id: "balanced", label: "Balanced", strength: 0.25, hint: "A mix of known names and new faces." },
    { id: "gems", label: "Hidden gems", strength: 0.5, hint: "The least-known artists of each scene." },
];

export const DEFAULT_MODE = "gems";

// The label and hint a mode shows for a source ("spotify" | "typed").
export function modeText(mode, source) {
    const typed = source === "typed";
    return {
        label: (typed && mode.labelTyped) || mode.label,
        hint: (typed && mode.hintTyped) || mode.hint,
    };
}

export function modeById(id) {
    return MODES.find((m) => m.id === id) ?? MODES.find((m) => m.id === DEFAULT_MODE);
}


// ── Listener counts ─────────────────────────────────────────────────────────

const compact = (n, unit) => {
    const value = n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, "");
    return value + unit;
};

// 950 → "950 listeners", 2637 → "2.6K listeners", 397060 → "397K listeners",
// 5000000 → "5M listeners", 1 → "1 listener", null → ""
export function formatListeners(count) {
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return "";
    const word = count === 1 ? "listener" : "listeners";
    if (count < 1000) return `${count} ${word}`;
    if (count < 1_000_000) return `${compact(count / 1000, "K")} ${word}`;
    return `${compact(count / 1_000_000, "M")} ${word}`;
}


// ── Spotify history (time_range of /me/top/artists) ─────────────────────────

// Spotify's own windows: short_term ≈ 4 weeks, medium_term ≈ 6 months,
// long_term ≈ 1 year. medium_term is Spotify's default, and ours.
export const TIME_RANGES = [
    { id: "short_term", label: "4 weeks", hint: "Only what you've played lately." },
    { id: "medium_term", label: "6 months", hint: "Your last six months of listening." },
    { id: "long_term", label: "1 year", hint: "Your favourites over about a year." },
];

export const DEFAULT_TIME_RANGE = "medium_term";

export function timeRangeById(id) {
    return TIME_RANGES.find((r) => r.id === id) ?? TIME_RANGES.find((r) => r.id === DEFAULT_TIME_RANGE);
}


// ── First-run tutorial ──────────────────────────────────────────────────────

const label = (list, id) => list.find((x) => x.id === id).label;

export const TUTORIAL = [
    {
        title: "Welcome to Overture",
        body: "Tell Overture which artists you love. It finds artists you haven't heard yet, from the same scenes. "
            + "You can skip this tutorial and open it again any time with the Tutorial button.",
    },
    {
        title: "Your music",
        body: "Type a few artists you love, in any language. Spotify is invite-only for now: "
            + "Spotify lets apps in testing connect only 5 accounts, added by hand.",
    },
    {
        title: "How far back",
        body: `With Spotify, choose how much of your history counts: the last ${label(TIME_RANGES, "short_term")}, `
            + `${label(TIME_RANGES, "medium_term")}, or about ${label(TIME_RANGES, "long_term")}.`,
    },
    {
        title: "How adventurous",
        body: `${MODES.find((m) => m.id === "familiar").labelTyped} (${label(MODES, "familiar")} with Spotify) stays closest to your artists. ${label(MODES, "balanced")} mixes in newer names. `
            + `${label(MODES, "gems")} digs for the least-known artists of each scene. You can switch after a search.`,
    },
    {
        title: "Your results",
        body: "Click a name to find the artist on Spotify, or the listener count to open Last.fm. "
            + "Not feeling them? Show me others brings the next ones.",
    },
];


// ── "Show me others" ────────────────────────────────────────────────────────

// The names shown since the last fresh search, plus the new batch: duplicates
// (case and spaces don't matter) are kept once, first spelling, in order.
// Sent back as `exclude` so the next batch skips them.
export function rememberShown(shown, recommendations) {
    if (!Array.isArray(shown)) throw new TypeError("shown must be an array");
    if (!Array.isArray(recommendations)) throw new TypeError("recommendations must be an array");
    const seen = new Set();
    const out = [];
    const add = (name) => {
        if (typeof name !== "string" || name.trim() === "") return;
        const key = normalizeArtist(name);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(name.trim());
    };
    for (const name of shown) add(name);
    for (const rec of recommendations) add(rec?.name);
    return out;
}

// True when a batch brings nobody new: empty, or every name already shown.
// That's the end of the pool for these artists.
export function nothingNew(shown, recommendations) {
    if (!Array.isArray(shown)) throw new TypeError("shown must be an array");
    if (!Array.isArray(recommendations)) throw new TypeError("recommendations must be an array");
    const seen = new Set(shown.filter((n) => typeof n === "string").map(normalizeArtist));
    return !recommendations.some((rec) =>
        typeof rec?.name === "string" && rec.name.trim() !== "" && !seen.has(normalizeArtist(rec.name)));
}


// ── Spotify link ────────────────────────────────────────────────────────────

// Spotify's artist search for a name: "Soolking" →
// https://open.spotify.com/search/Soolking/artists
// A search page, not the artist page: the ranking only knows names, and an
// exact page needs a Spotify ID (planned for v1.1). Works without signing in.
export function spotifySearchUrl(name) {
    if (typeof name !== "string") return null;
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean === "") return null;
    return `https://open.spotify.com/search/${encodeURIComponent(clean)}/artists`;
}


// ── "Because you listen to…" ────────────────────────────────────────────────

// Names of the top reasons, with "and N more" when there are others.
// ["A"] → "A" · ["A","B"] → "A and B" · ["A","B","C","D"] (max 2) → "A, B and 2 more"
export function becauseText(because, max = 2) {
    if (!Array.isArray(because)) return "";
    const names = because
        .filter((b) => b && typeof b.source === "string" && b.source.trim() !== "")
        .map((b) => b.source.trim());
    if (names.length === 0) return "";

    const shown = names.slice(0, max);
    const rest = names.length - shown.length;

    if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
    if (shown.length === 1) return shown[0];
    return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}


// ── Loading phrases ─────────────────────────────────────────────────────────

export const PHRASES = [
    "Your music is cooking. Hope your day is going well.",
    "Tuning the flute…",
    "Asking Last.fm who your favourites hang out with…",
    "Looking past the charts…",
    "Keeping one favourite from stealing the show…",
    "Dusting off a few hidden gems…",
    "Counting listeners, one by one…",
    "Warming up the orchestra…",
    "Writing a little overture, just for you…",
    "Good time for a sip of water.",
    "Almost there. The last notes are the best ones.",
    "Merging artists who go by two names…",
    "Following the music from scene to scene…",
];

// A new order on every run, never starting with the phrase the last run
// started with. `random` is injectable for tests (defaults to Math.random).
export function shufflePhrases(phrases, lastFirst = null, random = Math.random) {
    if (!Array.isArray(phrases)) throw new TypeError("phrases must be an array");
    const list = phrases.filter((p) => typeof p === "string" && p.trim() !== "");

    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }

    if (list.length > 1 && list[0] === lastFirst) {
        [list[0], list[1]] = [list[1], list[0]];
    }
    return list;
}


// ── Typed artists ───────────────────────────────────────────────────────────

// Adds one typed name to the list: trimmed, never split on commas
// ("Tyler, The Creator" is one artist), duplicates (same after trim and
// lowercase) ignored. Returns a new array.
export function addArtist(list, typed) {
    const current = Array.isArray(list) ? list.filter((a) => typeof a === "string") : [];
    if (typeof typed !== "string") return current;
    const name = typed.trim().replace(/\s+/g, " ");
    if (name === "") return current;
    const key = name.toLowerCase();
    if (current.some((a) => a.trim().toLowerCase() === key)) return current;
    return [...current, name];
}


// ── Errors shown to the user ────────────────────────────────────────────────

// Turns a pipeline error message into what the user should do next.
export function explainError(message) {
    const text = typeof message === "string" ? message : "";
    if (text === "") return "Overture's background didn't answer. Reload the extension in chrome://extensions and try again.";
    if (/NOT_LOGGED_IN|not logged in/i.test(text)) return "Connect Spotify first, or switch to typed artists.";
    if (/\b403\b/.test(text)) return "This Spotify account isn't on Overture's invite list. Ask me to add it, or type your artists instead.";
    if (/\b401\b/.test(text)) return "Your Spotify session expired. Connect Spotify again.";
    if (/NETWORK|fetch failed|Failed to fetch/i.test(text)) return "Couldn't reach Last.fm. Check your connection and try again.";
    if (/\b29\b|rate limit/i.test(text)) return "Last.fm asked us to slow down. Wait a minute, then try again.";
    return `Overture couldn't finish (${text}). Try again in a moment.`;
}
