// Overture popup: choose your music and a mode, watch the composer dance,
// read the results. All the work happens in background.js; this file only
// sends messages and draws.
//
// Messages sent (handled in background.js):
//   STATUS, CONNECT_SPOTIFY, DISCONNECT
//   GET_RECOMMENDATIONS { source: "spotify" | "typed", artists?: string[], strength: number,
//                         timeRange?: "short_term" | "medium_term" | "long_term" (Spotify only),
//                         exclude?: string[] (names already shown, for "Show me others") }
//     → { ok: true, recommendations, skipped } or { ok: false, error }

import { SPRITES } from "./sprites.js";
import { drawSprite, animatedSprite, drawPixelText } from "./pixel.js";
import {
    MODES, DEFAULT_MODE, modeById, modeText, formatListeners, becauseText,
    PHRASES, shufflePhrases, addArtist, explainError, spotifySearchUrl,
    rememberShown, nothingNew,
    TIME_RANGES, DEFAULT_TIME_RANGE, timeRangeById, TUTORIAL,
} from "./format.js";

const $ = (id) => document.getElementById(id);
const PREFS_KEY = "popup:prefs";
const PHRASE_MS = 2600;
const MIN_LOADING_MS = 1400;   // long enough to read one phrase

const state = {
    source: "typed",            // "spotify" | "typed" (typed by default: Spotify is invite-only)
    spotifyInvited: false,      // "I've been added": shows the Spotify sign-in
    artists: [],                // typed artists
    mode: DEFAULT_MODE,
    timeRange: DEFAULT_TIME_RANGE,  // Spotify history window
    tutorialDone: false,
    tutorialStep: 0,
    spotifyConnected: false,
    lastPhrase: null,
    busy: false,
    shown: [],                  // names shown since the last fresh list (reset on search and mode change)
};


// ── Messaging and storage ───────────────────────────────────────────────────

async function send(message) {
    try {
        const res = await chrome.runtime.sendMessage(message);
        return res ?? { ok: false, error: "" };
    } catch (err) {
        return { ok: false, error: err?.message ?? "" };
    }
}

async function loadPrefs() {
    try {
        const { [PREFS_KEY]: saved } = await chrome.storage.local.get(PREFS_KEY);
        if (saved && typeof saved === "object") {
            if (saved.source === "spotify" || saved.source === "typed") state.source = saved.source;
            if (Array.isArray(saved.artists)) state.artists = saved.artists.filter((a) => typeof a === "string");
            state.mode = modeById(saved.mode).id;
            state.timeRange = timeRangeById(saved.timeRange).id;
            state.tutorialDone = saved.tutorialDone === true;
            state.spotifyInvited = saved.spotifyInvited === true;
            if (typeof saved.lastPhrase === "string") state.lastPhrase = saved.lastPhrase;
        }
    } catch { /* first run, or storage unavailable: keep defaults */ }
}

function savePrefs() {
    const { source, artists, mode, timeRange, tutorialDone, spotifyInvited, lastPhrase } = state;
    chrome.storage.local.set({ [PREFS_KEY]: { source, artists, mode, timeRange, tutorialDone, spotifyInvited, lastPhrase } }).catch(() => {});
}


// ── The stage ───────────────────────────────────────────────────────────────

let composer;   // flute player in the header
let dancer;     // the loading dance

// A sprite tiled side by side (for the grass strip)
const repeatSprite = (rows, times) => rows.map((row) => row.repeat(times));

function drawStage() {
    const p = SPRITES.palette;

    composer = animatedSprite(SPRITES.play, p, 4, 3);
    $("composer").append(composer.svg);
    composer.start();

    for (let i = 0; i < 3; i++) $("notes").append(drawSprite(SPRITES.note, p, 3));

    $("cloud-a").append(drawSprite(SPRITES.cloud, p, 3));
    $("cloud-b").append(drawSprite(SPRITES.cloud, p, 2));
    $("sun").append(drawSprite(SPRITES.sun, p, 3));
    $("grass").append(drawSprite(repeatSprite(SPRITES.grass, 7), p, 3));
    $("grass-patch").append(drawSprite(repeatSprite(SPRITES.grass, 3), p, 3));

    $("title").append(drawPixelText("Overture", p.K, "#FFFFFF", 4));

    dancer = animatedSprite(SPRITES.dance, p, 6, 5);
    $("dancer").append(dancer.svg);
}


// ── Views ───────────────────────────────────────────────────────────────────

function show(view) {
    for (const name of ["tutorial", "setup", "loading", "results"]) {
        $(`view-${name}`).hidden = name !== view;
    }
    if (view === "loading") dancer.start(); else dancer.stop();
}


// ── Source tabs ─────────────────────────────────────────────────────────────

function selectSource(source, focus = false) {
    state.source = source;
    const tabs = { spotify: $("tab-spotify"), typed: $("tab-typed") };
    for (const [name, tab] of Object.entries(tabs)) {
        const selected = name === source;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        $(`panel-${name}`).hidden = !selected;
        if (selected && focus) tab.focus();
    }
    syncModes();
    savePrefs();
    updateGo();
}

function wireTabs() {
    $("tab-spotify").addEventListener("click", () => selectSource("spotify"));
    $("tab-typed").addEventListener("click", () => selectSource("typed"));
    for (const tab of [$("tab-spotify"), $("tab-typed")]) {
        tab.addEventListener("keydown", (e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            selectSource(state.source === "spotify" ? "typed" : "spotify", true);
        });
    }
}


// ── Spotify ─────────────────────────────────────────────────────────────────

function renderSpotify(res) {
    const status = $("spotify-status");
    if (!res?.ok) {
        state.spotifyConnected = false;
        status.textContent = res?.error ? explainError(res.error) : "Couldn't check Spotify.";
    } else {
        state.spotifyConnected = Boolean(res.loggedIn);
        status.textContent = res.loggedIn ? `Connected as ${res.name}` : "Not connected yet.";
    }
    syncSpotifyLock();
    updateGo();
}

// Spotify is invite-only: until someone says they've been added (or is
// already connected), the panel explains why instead of offering a sign-in.
function syncSpotifyLock() {
    const open = state.spotifyConnected || state.spotifyInvited;
    $("spotify-locked").hidden = open;
    $("spotify-open").hidden = !open;
    $("connect").hidden = state.spotifyConnected;
    $("disconnect").hidden = !state.spotifyConnected;
    $("tab-spotify").classList.toggle("tab--locked", !open);
}

function wireSpotify() {
    $("invited").addEventListener("click", () => {
        state.spotifyInvited = true;
        savePrefs();
        syncSpotifyLock();
        $("connect").focus();
    });
    $("use-typed").addEventListener("click", () => selectSource("typed", true));
    $("connect").addEventListener("click", async () => {
        $("spotify-status").textContent = "Opening Spotify…";
        renderSpotify(await send({ type: "CONNECT_SPOTIFY" }));
    });
    $("disconnect").addEventListener("click", async () => {
        renderSpotify(await send({ type: "DISCONNECT" }));
    });
}


// ── Spotify history ─────────────────────────────────────────────────────────

function renderRanges() {
    const box = $("ranges");
    box.replaceChildren(...TIME_RANGES.map((range) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mode";
        btn.setAttribute("role", "radio");
        btn.dataset.range = range.id;
        btn.textContent = range.label;
        btn.addEventListener("click", () => pickRange(range.id));
        btn.addEventListener("keydown", (e) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!step) return;
            e.preventDefault();
            const i = TIME_RANGES.findIndex((r) => r.id === state.timeRange);
            const next = TIME_RANGES[(i + step + TIME_RANGES.length) % TIME_RANGES.length].id;
            pickRange(next);
            box.querySelector(`[data-range="${next}"]`).focus();
        });
        return btn;
    }));
    syncRanges();
}

function syncRanges() {
    for (const btn of $("ranges").children) {
        const on = btn.dataset.range === state.timeRange;
        btn.setAttribute("aria-checked", String(on));
        btn.tabIndex = on ? 0 : -1;
    }
    $("range-hint").textContent = timeRangeById(state.timeRange).hint;
}

function pickRange(id) {
    state.timeRange = timeRangeById(id).id;
    syncRanges();
    savePrefs();
}


// ── Tutorial ────────────────────────────────────────────────────────────────

function renderTutorial() {
    const i = state.tutorialStep;
    const step = TUTORIAL[i];
    const last = i === TUTORIAL.length - 1;
    $("tut-step").textContent = `Tutorial, step ${i + 1} of ${TUTORIAL.length}`;
    $("tut-title").textContent = step.title;
    $("tut-body").textContent = step.body;
    $("tut-back").hidden = i === 0;
    $("tut-next").textContent = last ? "Let's go" : "Next";
    $("tut-skip").hidden = last;
    $("tut-dots").replaceChildren(...TUTORIAL.map((_, j) => {
        const dot = document.createElement("span");
        dot.className = j === i ? "dot dot--on" : "dot";
        return dot;
    }));
}

let tutorialReturn = "setup";   // the view the tutorial goes back to

function openTutorial(from = "setup") {
    tutorialReturn = from;
    state.tutorialStep = 0;
    renderTutorial();
    show("tutorial");
    $("tut-title").focus();
}

function closeTutorial() {
    state.tutorialDone = true;
    savePrefs();
    show(tutorialReturn);
    (tutorialReturn === "results" ? $("results-title") : $("go")).focus();
}

function wireTutorial() {
    $("tut-next").addEventListener("click", () => {
        if (state.tutorialStep === TUTORIAL.length - 1) return closeTutorial();
        state.tutorialStep += 1;
        renderTutorial();
        $("tut-title").focus();
    });
    $("tut-back").addEventListener("click", () => {
        state.tutorialStep = Math.max(0, state.tutorialStep - 1);
        renderTutorial();
        $("tut-title").focus();
    });
    $("tut-skip").addEventListener("click", closeTutorial);
    $("help").addEventListener("click", () => openTutorial("setup"));
    $("help-results").addEventListener("click", () => openTutorial("results"));
}


// ── Typed artists ───────────────────────────────────────────────────────────

function renderChips() {
    const list = $("chips");
    list.replaceChildren(...state.artists.map((name) => {
        const li = document.createElement("li");
        li.className = "chip";
        const label = document.createElement("span");
        label.textContent = name;
        label.dir = "auto";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${name}`);
        remove.addEventListener("click", () => {
            state.artists = state.artists.filter((a) => a !== name);
            renderChips();
            savePrefs();
            $("artist-input").focus();
        });
        li.append(label, remove);
        return li;
    }));
    $("typed-help").textContent = state.artists.length === 0
        ? "Add a few artists you love, in any language."
        : `${state.artists.length} artist${state.artists.length === 1 ? "" : "s"} added.`;
    updateGo();
}

function wireTyped() {
    $("add-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const input = $("artist-input");
        state.artists = addArtist(state.artists, input.value);
        input.value = "";
        renderChips();
        savePrefs();
    });
}


// ── Modes ───────────────────────────────────────────────────────────────────

function renderModes(containerId, onPick) {
    const box = $(containerId);
    box.replaceChildren(...MODES.map((mode) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mode";
        btn.setAttribute("role", "radio");
        btn.dataset.mode = mode.id;
        btn.textContent = mode.label;
        btn.addEventListener("click", () => onPick(mode.id));
        btn.addEventListener("keydown", (e) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!step) return;
            e.preventDefault();
            const i = MODES.findIndex((m) => m.id === state.mode);
            const next = MODES[(i + step + MODES.length) % MODES.length].id;
            onPick(next);
            box.querySelector(`[data-mode="${next}"]`).focus();
        });
        return btn;
    }));
}

function syncModes() {
    for (const btn of document.querySelectorAll(".mode[data-mode]")) {
        btn.textContent = modeText(modeById(btn.dataset.mode), state.source).label;
        const on = btn.dataset.mode === state.mode;
        btn.setAttribute("aria-checked", String(on));
        btn.tabIndex = on ? 0 : -1;
    }
    $("mode-hint").textContent = modeText(modeById(state.mode), state.source).hint;
}

function pickMode(id) {
    state.mode = modeById(id).id;
    syncModes();
    savePrefs();
}


// ── Searching ───────────────────────────────────────────────────────────────

function updateGo() {
    const ready = state.source === "spotify" ? state.spotifyConnected : state.artists.length > 0;
    $("go").disabled = !ready || state.busy;
}

function request(exclude = []) {
    const message = { type: "GET_RECOMMENDATIONS", source: state.source, strength: modeById(state.mode).strength };
    if (state.source === "typed") message.artists = [...state.artists];
    if (state.source === "spotify") message.timeRange = state.timeRange;
    if (exclude.length > 0) message.exclude = [...exclude];
    return send(message);
}

function startPhrases() {
    const order = shufflePhrases(PHRASES, state.lastPhrase);
    state.lastPhrase = order[0];
    savePrefs();
    let i = 0;
    $("phrase").textContent = order[0];
    const timer = setInterval(() => {
        i = (i + 1) % order.length;
        $("phrase").textContent = order[i];
    }, PHRASE_MS);
    return () => clearInterval(timer);
}

async function search() {
    if (state.busy) return;
    state.busy = true;
    updateGo();
    $("setup-error").hidden = true;

    show("loading");
    const stopPhrases = startPhrases();
    const [res] = await Promise.all([request(), new Promise((r) => setTimeout(r, MIN_LOADING_MS))]);
    stopPhrases();
    state.busy = false;
    updateGo();

    if (!res.ok) {
        show("setup");
        const box = $("setup-error");
        box.textContent = explainError(res.error);
        box.hidden = false;
        return;
    }
    state.shown = rememberShown([], res.recommendations ?? []);
    renderResults(res);
    show("results");
    $("results-title").focus();
}

// On the results screen, nothing needs the network: Last.fm's answers are
// cached, so no dance, just swap the list.
async function swapList(exclude) {
    state.busy = true;
    $("results").setAttribute("aria-busy", "true");
    $("results").style.opacity = "0.5";
    const res = await request(exclude);
    state.busy = false;
    $("results").removeAttribute("aria-busy");
    $("results").style.opacity = "";

    if (!res.ok) {
        const box = $("results-error");
        box.textContent = explainError(res.error);
        box.hidden = false;
        return null;
    }
    return res;
}

// A fresh list: same artists, from the top again.
async function freshList() {
    const res = await swapList([]);
    if (!res) return;
    state.shown = rememberShown([], res.recommendations ?? []);
    renderResults(res);
}

// Another mode: a fresh list (what was shown is forgotten).
async function rerank(id) {
    if (state.busy || id === state.mode) return;
    pickMode(id);
    await freshList();
}

// Same mode, without the artists already shown.
async function showOthers() {
    if (state.busy) return;
    const res = await swapList(state.shown);
    if (!res) return;
    const recs = res.recommendations ?? [];
    if (nothingNew(state.shown, recs)) {
        $("more").hidden = true;
        $("more-done").hidden = false;
        $("restart").focus();
        return;
    }
    state.shown = rememberShown(state.shown, recs);
    renderResults(res);
    $("results-title").focus();
}

async function startOver() {
    if (state.busy) return;
    await freshList();
    $("results-title").focus();
}


// ── Results ─────────────────────────────────────────────────────────────────

function link(href, className, text) {
    const el = document.createElement(href ? "a" : "span");
    el.className = className;
    el.textContent = text;
    if (href) {
        el.href = href;
        el.target = "_blank";
        el.rel = "noopener";
    }
    return el;
}

function renderResults({ recommendations = [], skipped = [] }) {
    $("results-error").hidden = true;
    $("more").hidden = recommendations.length === 0;
    $("more-done").hidden = true;
    const n = recommendations.length;
    $("results-title").textContent = n === 0 ? "Nothing new this time" : `${n} artist${n === 1 ? "" : "s"} to try`;

    $("results").replaceChildren(...recommendations.map((rec) => {
        const li = document.createElement("li");
        li.className = "result";

        // The name opens Spotify (artist search); the listener count opens Last.fm.
        const spotify = spotifySearchUrl(rec.name);
        const name = link(spotify, "result__name", rec.name);
        name.dir = "auto";
        if (spotify) name.title = `Search ${rec.name} on Spotify`;

        const listeners = link(rec.lastfmUrl, "result__listeners", formatListeners(rec.listeners));
        if (rec.lastfmUrl) listeners.title = "Open on Last.fm";

        const because = document.createElement("p");
        because.className = "result__because";
        because.textContent = `Because you listen to ${becauseText(rec.because)}`;
        because.dir = "auto";

        li.append(name, listeners, because);
        return li;
    }));

    const empty = $("empty");
    empty.hidden = n > 0;
    empty.textContent = state.source === "spotify" && state.timeRange === "short_term"
        ? "Spotify has little recent listening for you. Try 6 months."
        : state.mode === "familiar"
        ? "Add a few more artists you love, then try again."
        : "Add a few more artists you love, or try Familiar.";

    const skip = $("skipped");
    skip.hidden = skipped.length === 0;
    skip.textContent = skipped.length
        ? `Not found on Last.fm: ${skipped.join(", ")}. Check the spelling, or try another artist.`
        : "";
}


// ── Start ───────────────────────────────────────────────────────────────────

async function init() {
    drawStage();
    await loadPrefs();

    wireTabs();
    wireSpotify();
    wireTyped();
    renderModes("modes-setup", pickMode);
    renderRanges();
    wireTutorial();
    renderModes("modes-results", rerank);
    syncModes();
    renderChips();
    selectSource(state.source);

    $("go").addEventListener("click", search);
    $("more").addEventListener("click", showOthers);
    $("restart").addEventListener("click", startOver);
    $("back").addEventListener("click", () => { show("setup"); $("go").focus(); });

    if (state.tutorialDone) show("setup"); else openTutorial("setup");
    renderSpotify(await send({ type: "STATUS" }));
}

init();
