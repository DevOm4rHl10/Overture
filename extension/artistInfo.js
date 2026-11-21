import { lastfmGet, LastfmError } from "./lastfm.js";
import { normalizeArtist } from "./shared/normalize.js";
import { cacheGet, cacheSet } from "./cache.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;


/**
 * Retrieves an artist's listener count and Last.fm URL.
 *
 * @param {string} name
 * @returns {Promise<{ listeners: number | null, url: string | null }>}
 */
export async function getArtistInfo(name) {

    if (typeof name !== "string" || name.trim() === "") {
        throw new TypeError("Artist name must be a non-empty string");
    }

    const response = await lastfmGet("artist.getinfo", {
        artist: name.trim(),
        autocorrect: 1
    });

    const rawListeners = response?.artist?.stats?.listeners;

    let listeners = null;

    if (typeof rawListeners === "string" && rawListeners.trim() !== "") {

        const parsedListeners = Number(rawListeners);

        if (Number.isFinite(parsedListeners) && parsedListeners >= 0) {
            listeners = parsedListeners;
        }
    }

    const url = response?.artist?.url || null;

    return {
        listeners: listeners,
        url: url
    };
}


/**
 * Retrieves listener counts for multiple artists.
 *
 * Successful results, including unknown listener counts, are cached
 * for one day. Last.fm error code 6 is not cached.
 *
 * @param {string[]} names
 * @param {number} pauseMs
 * @returns {Promise<Record<string, number | null>>}
 */
export async function getListenerCounts(names, pauseMs = 0) {

    if (!Array.isArray(names)) {
        throw new TypeError("Names must be an array");
    }

    if (
        typeof pauseMs !== "number" ||
        !Number.isFinite(pauseMs) ||
        pauseMs < 0
    ) {
        throw new TypeError("pauseMs must be a finite non-negative number");
    }

    const results = {};
    let hasMadeRequest = false;

    for (const name of names) {

        // Skip malformed names
        if (typeof name !== "string" || name.trim() === "") {
            continue;
        }

        const key = "info:" + normalizeArtist(name);

        if (key === "info:") {
            continue;
        }

        let cached = null;

        // Try the cache
        try {
            cached = await cacheGet(key);
        } catch (error) {

            if (error instanceof TypeError) {
                throw error;
            }

            console.warn("Artist info cache read failed:", error);
        }

        // A cached null listener count is still a valid cache hit
        if (
            cached != null &&
            typeof cached === "object" &&
            Object.hasOwn(cached, "listeners") &&
            (
                cached.listeners === null ||
                (
                    typeof cached.listeners === "number" &&
                    Number.isFinite(cached.listeners) &&
                    cached.listeners >= 0
                )
            )
        ) {
            results[name] = cached.listeners;
            continue;
        }

        // Pause only between actual network requests
        if (hasMadeRequest && pauseMs > 0) {
            await new Promise(resolve => setTimeout(resolve, pauseMs));
        }

        let info;

        try {
            hasMadeRequest = true;
            info = await getArtistInfo(name);

        } catch (error) {

            if (error instanceof LastfmError && error.code === 6) {
                results[name] = null;
                continue;
            }

            throw error;
        }

        results[name] = info.listeners;

        // Cache the complete successful response
        try {
            await cacheSet(key, info, ONE_DAY_MS);
        } catch (error) {

            if (error instanceof TypeError) {
                throw error;
            }

            console.warn("Artist info cache write failed:", error);
        }
    }

    return results;
}