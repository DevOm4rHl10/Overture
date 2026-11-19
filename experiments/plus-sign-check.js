// ─────────────────────────────────────────────────────────────────────────────
// Experiment: can artists with "+" in their name be reached on Last.fm?
//
// Last.fm's API turns "+" into a space: asking for "Florence + the Machine"
// returns the small page "Florence   The Machine" (20K listeners instead of
// millions). This script tries several ways of sending the name and shows
// which one reaches the real artist (the one with the most listeners).
//
// It sends raw requests (not through lastfmGet) on purpose: lastfmGet always
// encodes names the standard way, and here we want to try other encodings.
//
// Run from the repo root:  node experiments/plus-sign-check.js
// ─────────────────────────────────────────────────────────────────────────────

import { LASTFM_API_KEY } from "../extension/config.js";

const ARTISTS = ["Florence + the Machine", "Ich + Ich", "Queen + Paul Rodgers", "nobodyknows+"];
const BASE = "https://ws.audioscrobbler.com/2.0/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Build the query string by hand so each variant controls its own encoding
function rawUrl(method, encodedArtist, extra = "")
{
    return `${BASE}?method=${method}&artist=${encodedArtist}&api_key=${LASTFM_API_KEY}&format=json${extra}`;
}

const VARIANTS = {
    "standard (what lastfmGet sends)": (n) => rawUrl("artist.getinfo", new URLSearchParams({ a: n }).toString().slice(2)),
    "spaces as %20, + as %2B": (n) => rawUrl("artist.getinfo", encodeURIComponent(n)),
    "+ encoded twice (%252B)": (n) => rawUrl("artist.getinfo", encodeURIComponent(n).replace(/%2B/g, "%252B")),
    "+ replaced by 'and'": (n) => rawUrl("artist.getinfo", encodeURIComponent(n.replace(/\s*\+\s*/g, " and ").trim()), "&autocorrect=1"),
    "+ replaced by '&'": (n) => rawUrl("artist.getinfo", encodeURIComponent(n.replace(/\s*\+\s*/g, " & ").trim()), "&autocorrect=1"),
};

async function getJson(url)
{
    await sleep(250);
    try { return await (await fetch(url)).json(); }
    catch (err) { return { error: "NETWORK", message: err.message }; }
}

const describe = (body) => body?.artist
    ? `"${body.artist.name}" · ${Number(body.artist.stats?.listeners ?? 0).toLocaleString("en")} listeners · mbid ${body.artist.mbid || "–"}`
    : `error ${body?.error}: ${body?.message}`;

for (const artist of ARTISTS)
{
    console.log(`\n▶ ${artist}`);
    for (const [label, makeUrl] of Object.entries(VARIANTS))
    {
        console.log(`   ${label.padEnd(34)} → ${describe(await getJson(makeUrl(artist)))}`);
    }

    // Search, then fetch the best match by its MusicBrainz ID (no name involved)
    const search = await getJson(`${BASE}?method=artist.search&artist=${encodeURIComponent(artist)}&limit=5&api_key=${LASTFM_API_KEY}&format=json`);
    const matches = search?.results?.artistmatches?.artist ?? [];
    const list = (Array.isArray(matches) ? matches : [matches])
        .map((m) => ({ name: m.name, listeners: Number(m.listeners), mbid: m.mbid }));
    console.log(`   ${"artist.search (top 5)".padEnd(34)} → ${list.map((m) => `"${m.name}" ${m.listeners.toLocaleString("en")}`).join(" · ") || describe(search)}`);

    const best = list.filter((m) => m.mbid).sort((a, b) => b.listeners - a.listeners)[0];
    if (best)
    {
        const byMbid = await getJson(`${BASE}?method=artist.getinfo&mbid=${best.mbid}&api_key=${LASTFM_API_KEY}&format=json`);
        console.log(`   ${"getinfo by MBID of best match".padEnd(34)} → ${describe(byMbid)}`);
        const similar = await getJson(`${BASE}?method=artist.getsimilar&mbid=${best.mbid}&limit=5&api_key=${LASTFM_API_KEY}&format=json`);
        const names = similar?.similarartists?.artist;
        console.log(`   ${"getsimilar by MBID".padEnd(34)} → ${Array.isArray(names) ? names.map((s) => s.name).join(", ") : describe(similar)}`);
    }
}