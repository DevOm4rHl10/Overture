import { lastfmGet, LastfmError } from "./lastfm.js";
import { normalizeArtist } from "./shared/normalize.js";
import { cacheGet, cacheSet } from "./cache.js";


const SIMILAR_LIMIT = 15;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;


// Wait between actual network requests
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// Retrieve similar artists from Last.fm
export async function getSimilarArtists(artist) {

    const method = "artist.getsimilar";

    if (typeof artist !== "string") {
        throw new TypeError("Artist must be a string");
    }

    if (artist.trim() === "") {
        throw new TypeError("Artist cannot be empty");
    }

    let response = await lastfmGet(method, {
        artist: artist.trim(),
        limit: SIMILAR_LIMIT,
        autocorrect: 1
    });

    if (response == null || response.similarartists == null) {
        return [];
    }

    const similarArtists = response.similarartists;

    if (similarArtists.artist == null) {
        return [];
    }

    let data = similarArtists.artist;

    if (!Array.isArray(data)) {
        data = [data];
    }

    return data
        .map(entry => {

            if (entry == null || typeof entry.name !== "string") {
                return null;
            }

            const rawMatch = entry.match;

            if (
                (typeof rawMatch !== "string" && typeof rawMatch !== "number") ||
                String(rawMatch).trim() === ""
            ) {
                return null;
            }

            return {
                name: entry.name.trim(),
                match: Number(rawMatch),
                url: entry.url || null,
                mbid: entry.mbid === "" || entry.mbid == null
                    ? null
                    : entry.mbid
            };
        })
        .filter(entry =>
            entry !== null &&
            entry.name !== "" &&
            Number.isFinite(entry.match) &&
            entry.match >= 0 &&
            entry.match <= 1
        );
}


// Build a similarity graph from the source artists
export async function buildSimilarityGraph(sourceArtists, pauseMs = 0) {

    // Validate top-level input
    if (!Array.isArray(sourceArtists)) {
        throw new TypeError("Source artists must be an array");
    }

    // Validate pause duration
    if (
        typeof pauseMs !== "number" ||
        !Number.isFinite(pauseMs) ||
        pauseMs < 0
    ) {
        throw new TypeError("Pause duration must be a finite, non-negative number");
    }

    const graph = [];
    const skipped = [];

    // Tracks artists already handled during this run
    const seen = new Set();

    // Tracks actual network requests, not cache lookups
    let hasMadeRequest = false;

    for (const object of sourceArtists) {

        // Skip malformed entries
        if (object == null || typeof object !== "object" || Array.isArray(object)) {
            continue;
        }

        if (typeof object.name !== "string" || object.name.trim() === "") {
            continue;
        }

        if (
            typeof object.weight !== "number" ||
            !Number.isFinite(object.weight) ||
            object.weight < 0 ||
            object.weight > 1
        ) {
            continue;
        }

        const artist = object.name.trim();
        const weight = object.weight;

        // Skip artists with weight 0
        if (weight === 0) {
            continue;
        }

        // Normalize artist name for duplicate detection
        const normalized = normalizeArtist(artist);

        // Skip artists already handled
        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);

        // Build cache key
        const key = "similar:" + normalized + ":" + SIMILAR_LIMIT;

        // Try to retrieve the cached value
        let cached = null;

        try {
            cached = await cacheGet(key);
        } catch (error) {

            // Programming/input errors must not be hidden
            if (error instanceof TypeError) {
                throw error;
            }

            // Storage failures should count as cache misses
            console.warn("Cache read failed:", error);
        }

        // A valid cached value must be an array.
        // An empty array is still a cache hit.
        if (Array.isArray(cached)) {

            graph.push({
                source: artist,
                weight: weight,
                similar: cached
            });

            continue;
        }

        // Cache miss: pause only between actual network requests
        if (hasMadeRequest && pauseMs > 0) {
            await sleep(pauseMs);
        }

        hasMadeRequest = true;

        // Query Last.fm
        try {

            const similar = await getSimilarArtists(artist);

            // Try to cache the successful response
            try {
                await cacheSet(key, similar, ONE_DAY_MS);
            } catch (error) {

                // Programming/input errors must not be hidden
                if (error instanceof TypeError) {
                    throw error;
                }

                // Storage failures should not stop the graph
                console.warn("Cache write failed:", error);
            }

            graph.push({
                source: artist,
                weight: weight,
                similar: similar
            });

        } catch (error) {

            // Last.fm error code 6: artist not found
            if (error instanceof LastfmError && error.code === 6) {

                skipped.push(artist);
                continue;
            }

            // Any other error stops execution
            throw error;
        }
    }

    return {
        graph: graph,
        skipped: skipped
    };
}