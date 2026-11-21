import { normalizeArtist } from "./shared/normalize.js";
import { isSameArtist } from "./shared/transliterate.js";

const POOL_SIZE = 40;
const POOL_PER_SEED = 5;

const SHORTLIST_SIZE = 20;
const MAX_PER_SEED = 3;
const DEFAULT_STRENGTH = 0.5;

const MIN_FACTOR = 0.25;
const MAX_FACTOR = 4;

const MIN_LISTENERS = 50;
const MIN_SCENE_SIZE = 3;

function getKnownArtistNames(knownArtists) {

    if (!Array.isArray(knownArtists)) {
        throw new TypeError("Known artists must be an array");
    }

    const names = [];

    for (const artist of knownArtists) {

        if (
            artist == null ||
            typeof artist !== "object" ||
            typeof artist.name !== "string" ||
            artist.name.trim() === ""
        ) {
            continue;
        }

        names.push(artist.name.trim());
    }

    return names;
}


export function collectCandidates(graph) {

    if (!Array.isArray(graph)) {
        throw new TypeError("Graph must be an array");
    }

    const byKey = new Map();

    for (const seed of graph) {

        // Skip malformed seeds
        if (
            seed == null ||
            typeof seed !== "object" ||
            typeof seed.source !== "string" ||
            seed.source.trim() === "" ||
            typeof seed.weight !== "number" ||
            !Number.isFinite(seed.weight) ||
            seed.weight < 0 ||
            seed.weight > 1 ||
            !Array.isArray(seed.similar)
        ) {
            continue;
        }

        for (const artist of seed.similar) {

            // Skip malformed artists
            if (
                artist == null ||
                typeof artist !== "object" ||
                typeof artist.name !== "string" ||
                artist.name.trim() === "" ||
                typeof artist.match !== "number" ||
                !Number.isFinite(artist.match) ||
                artist.match < 0 ||
                artist.match > 1
            ) {
                continue;
            }

            const name = artist.name.trim();
            const key = normalizeArtist(name);

            if (key === "") {
                continue;
            }

            const contribution = artist.match * seed.weight;

            let candidate = byKey.get(key);

            if (candidate == null) {
                candidate = {
                    name: name,
                    url: artist.url || null,
                    best: contribution,
                    sources: new Map()
                };

                byKey.set(key, candidate);
            }

            // Keep name and URL from the largest contribution
            if (contribution > candidate.best) {
                candidate.name = name;
                candidate.url = artist.url || null;
                candidate.best = contribution;
            }

            // Keep only the largest contribution from each seed
            const previous = candidate.sources.get(seed.source) || 0;

            if (contribution > previous) {
                candidate.sources.set(seed.source, contribution);
            }
        }
    }

    const candidates = [];

    for (const candidate of byKey.values()) {

        const because = [];

        for (const [source, contribution] of candidate.sources) {
            because.push({
                source: source,
                contribution: contribution
            });
        }

        candidates.push({
            name: candidate.name,
            url: candidate.url,
            because: because
        });
    }

    return candidates;
}


export function sortByScore(candidates) {

    if (!Array.isArray(candidates)) {
        throw new TypeError("Candidates must be an array");
    }

    const ranked = [];

    for (const candidate of candidates) {

        // Skip malformed candidates
        if (
            candidate == null ||
            typeof candidate !== "object" ||
            typeof candidate.name !== "string" ||
            candidate.name.trim() === "" ||
            !Array.isArray(candidate.because)
        ) {
            continue;
        }

        // Keep the largest contribution from each source
        const sources = new Map();

        for (const item of candidate.because) {

            if (
                item == null ||
                typeof item !== "object" ||
                typeof item.source !== "string" ||
                item.source.trim() === "" ||
                typeof item.contribution !== "number" ||
                !Number.isFinite(item.contribution) ||
                item.contribution < 0
            ) {
                continue;
            }

            const previous = sources.get(item.source) || 0;

            if (item.contribution > previous) {
                sources.set(item.source, item.contribution);
            }
        }

        const because = [];

        for (const [source, contribution] of sources) {
            because.push({
                source: source,
                contribution: contribution
            });
        }

        // A candidate without valid reasons cannot be ranked
        if (because.length === 0) {
            continue;
        }

        // Sort contributions from highest to lowest
        because.sort((a, b) => b.contribution - a.contribution);

        // Calculate total score
        const score = because.reduce(
            (total, item) => total + item.contribution,
            0
        );

        ranked.push({
            name: candidate.name,
            url: candidate.url,
            because: because,
            score: score
        });
    }

    // Sort by score, then alphabetically with a fixed locale
    ranked.sort((a, b) => {

        if (b.score !== a.score) {
            return b.score - a.score;
        }

        return a.name.localeCompare(b.name, "en");
    });

    return ranked;
}

// "47 Soul" and "47Soul", "S. Janaki" and "S.Janaki": the same artist written
// with different spacing. Used only to remove known artists: a mistake there
// hides one artist (Laylow when Lay Low is known), never merges two.
function withoutSpaces(name) {
    return normalizeArtist(name).replace(/\s+/g, "");
}

export function removeKnown(candidates, knownArtists) {

    if (!Array.isArray(candidates)) {
        throw new TypeError("Candidates must be an array");
    }

    const knownNames = getKnownArtistNames(knownArtists);
    const knownKeys = new Set(knownNames.map(withoutSpaces));
    const filtered = [];

    for (const candidate of candidates) {

        if (
            candidate == null ||
            typeof candidate !== "object" ||
            typeof candidate.name !== "string" ||
            candidate.name.trim() === ""
        ) {
            continue;
        }

        const isKnown =
        knownKeys.has(withoutSpaces(candidate.name)) ||
        knownNames.some(knownName => isSameArtist(candidate.name, knownName));

        if (!isKnown) {
            filtered.push(candidate);
        }
    }

    return filtered;
}


export function mergeDuplicates(candidates) {

    if (!Array.isArray(candidates)) {
        throw new TypeError("Candidates must be an array");
    }

    const groups = [];

    for (const candidate of candidates) {

        // Skip malformed candidates
        if (
            candidate == null ||
            typeof candidate !== "object" ||
            typeof candidate.name !== "string" ||
            candidate.name.trim() === "" ||
            !Array.isArray(candidate.because)
        ) {
            continue;
        }

        // Keep only valid contributions
        const validBecause = [];

        for (const item of candidate.because) {

            if (
                item == null ||
                typeof item !== "object" ||
                typeof item.source !== "string" ||
                item.source.trim() === "" ||
                typeof item.contribution !== "number" ||
                !Number.isFinite(item.contribution) ||
                item.contribution < 0
            ) {
                continue;
            }

            validBecause.push({
                source: item.source,
                contribution: item.contribution
            });
        }

        // A candidate without valid reasons cannot be merged
        if (validBecause.length === 0) {
            continue;
        }

        // Find the candidate's strongest individual contribution
        let bestContribution = -1;

        for (const item of validBecause) {

            if (item.contribution > bestContribution) {
                bestContribution = item.contribution;
            }
        }

        // Find the first group whose original name matches
        let matchingGroup = null;

        for (const group of groups) {

            if (isSameArtist(candidate.name.trim(), group.matchName)) {
                matchingGroup = group;
                break;
            }
        }

        // No match: create a new group
        if (matchingGroup == null) {

            matchingGroup = {
                // Keep this name fixed for matching purposes
                matchName: candidate.name.trim(),

                // These fields can change as stronger candidates arrive
                name: candidate.name.trim(),
                url: candidate.url ?? null,
                bestContribution: bestContribution,

                // One contribution per source
                sources: new Map()
            };

            groups.push(matchingGroup);
        }

        // Update display name and URL if this candidate has
        // a stronger individual contribution.
        // On ties, the earlier candidate wins.
        if (bestContribution > matchingGroup.bestContribution) {
            matchingGroup.name = candidate.name.trim();
            matchingGroup.url = candidate.url ?? null;
            matchingGroup.bestContribution = bestContribution;
        }

        // Merge contributions, keeping the largest per source
        for (const item of validBecause) {

            const previous = matchingGroup.sources.get(item.source);

            if (
                previous === undefined ||
                item.contribution > previous
            ) {
                matchingGroup.sources.set(
                    item.source,
                    item.contribution
                );
            }
        }
    }

    // Convert groups back into candidate objects
    const merged = [];

    for (const group of groups) {

        const because = [];

        for (const [source, contribution] of group.sources) {
            because.push({
                source: source,
                contribution: contribution
            });
        }

        merged.push({
            name: group.name,
            url: group.url,
            because: because
        });
    }

    return merged;
}


export function removeCollaborations(candidates, knownArtists) {

    if (!Array.isArray(candidates)) {
        throw new TypeError("Candidates must be an array");
    }

    const knownNames = getKnownArtistNames(knownArtists);
    const filtered = [];

    for (const candidate of candidates) {

        if (
            candidate == null ||
            typeof candidate !== "object" ||
            typeof candidate.name !== "string" ||
            candidate.name.trim() === ""
        ) {
            continue;
        }

        const parts = candidate.name
            .split(", ")
            .map(part => part.trim())
            .filter(part => part !== "");

        // A single name is not a collaboration
        if (parts.length < 2) {
            filtered.push(candidate);
            continue;
        }

        const containsKnownArtist = parts.some(part =>
            knownNames.some(knownName =>
                isSameArtist(part, knownName)
            )
        );

        if (!containsKnownArtist) {
            filtered.push(candidate);
        }
    }

    return filtered;
}


/**
 * Caps the number of candidates per main seed.
 *
 * Expects candidates sorted by sortByScore(), because the first
 * entry in each candidate's `because` array determines its main seed.
 *
 * Candidates exceeding the per-seed cap are moved to the end
 * in their original order to fill any remaining pool slots.
 */
export function capPerSeed(candidates, maxPerSeed, limit) {

    if (!Array.isArray(candidates)) {
        throw new TypeError("Candidates must be an array");
    }

    if (!Number.isInteger(maxPerSeed) || maxPerSeed < 1) {
        throw new TypeError("maxPerSeed must be an integer greater than or equal to 1");
    }

    if (!Number.isInteger(limit) || limit < 1) {
        throw new TypeError("limit must be an integer greater than or equal to 1");
    }

    const counts = new Map();
    const kept = [];
    const skipped = [];

    for (const candidate of candidates) {

        // Skip malformed candidates and candidates without valid reasons
        if (
            candidate == null ||
            typeof candidate !== "object" ||
            !Array.isArray(candidate.because) ||
            candidate.because.length === 0
        ) {
            continue;
        }

        const mainReason = candidate.because[0];

        if (
            mainReason == null ||
            typeof mainReason !== "object" ||
            typeof mainReason.source !== "string" ||
            mainReason.source.trim() === ""
        ) {
            continue;
        }

        if (kept.length >= limit) {
            break;
        }

        const seed = mainReason.source;
        const count = counts.get(seed) || 0;

        if (count < maxPerSeed) {
            kept.push(candidate);
            counts.set(seed, count + 1);
        } else {
            skipped.push(candidate);
        }
    }

    // Fill remaining slots with skipped candidates, preserving their order
    for (const candidate of skipped) {

        if (kept.length >= limit) {
            break;
        }

        kept.push(candidate);
    }

    return kept;
}


/**
 * Builds the initial candidate pool from the similarity graph.
 */
export function buildPool(graph, knownArtists) {

    if (!Array.isArray(graph)) {
        throw new TypeError("Graph must be an array");
    }

    if (!Array.isArray(knownArtists)) {
        throw new TypeError("Known artists must be an array");
    }

    const candidates = collectCandidates(graph);
    const unknown = removeKnown(candidates, knownArtists);
    const nonCollaborations = removeCollaborations(
        unknown,
        knownArtists
    );

    const merged = mergeDuplicates(nonCollaborations);
    const ranked = sortByScore(merged);

    return capPerSeed(
        ranked,
        POOL_PER_SEED,
        POOL_SIZE
    );
}


export function toRecommendations(candidates) {

    if (!Array.isArray(candidates)) {
        throw new TypeError("Candidates must be an array");
    }

    const recommendations = [];

    for (const candidate of candidates) {

        if (
            candidate == null ||
            typeof candidate !== "object" ||
            typeof candidate.name !== "string" ||
            candidate.name.trim() === "" ||
            !Array.isArray(candidate.because)
        ) {
            continue;
        }

        recommendations.push({
            name: candidate.name,
            score: candidate.score,
            listeners: candidate.listeners,
            because: candidate.because.map(item => ({
                source: item.source,
                contribution: item.contribution
            })),
            lastfmUrl: candidate.url
        });
    }

    return recommendations;
}


export function rankPool(
    pool,
    listeners,
    strength = DEFAULT_STRENGTH
) {

    // Validate everything before running the pipeline
    if (!Array.isArray(pool)) {
        throw new TypeError("Pool must be an array");
    }

    if (
        listeners == null ||
        typeof listeners !== "object" ||
        Array.isArray(listeners)
    ) {
        throw new TypeError("Listeners must be an object");
    }

    if (
        typeof strength !== "number" ||
        !Number.isFinite(strength) ||
        strength < 0 ||
        strength > 1
    ) {
        throw new TypeError("Strength must be a number between 0 and 1");
    }

    const obscured = applyObscurity(pool, listeners, strength);

    const shortlist = capPerSeed(
        obscured,
        MAX_PER_SEED,
        SHORTLIST_SIZE
    );

    return toRecommendations(shortlist);
}

function median(values) {

    if (values.length === 0) {
        return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}


export function applyObscurity(
    pool,
    listeners,
    strength = DEFAULT_STRENGTH
) {

    if (!Array.isArray(pool)) {
        throw new TypeError("Pool must be an array");
    }

    if (
        listeners == null ||
        typeof listeners !== "object" ||
        Array.isArray(listeners)
    ) {
        throw new TypeError("Listeners must be an object");
    }

    if (
        typeof strength !== "number" ||
        !Number.isFinite(strength) ||
        strength < 0 ||
        strength > 1
    ) {
        throw new TypeError("Strength must be a number between 0 and 1");
    }

    const counts = new Map();
    const seedCounts = new Map();
    const poolCounts = [];

    // Collect valid listener counts
    for (const candidate of pool) {

        if (
            candidate == null ||
            typeof candidate !== "object" ||
            typeof candidate.name !== "string" ||
            candidate.name.trim() === "" ||
            !Number.isFinite(candidate.score)
        ) {
            continue;
        }

        const rawCount = listeners[candidate.name];

        const count =
            typeof rawCount === "number" &&
            Number.isFinite(rawCount) &&
            rawCount >= 0
                ? rawCount
                : null;

        counts.set(candidate, count);

        if (count > 0) {
            poolCounts.push(count);
        }

        const seed = candidate.because?.[0]?.source;

        if (typeof seed === "string" && seed.trim() !== "" && count > 0) {

            if (!seedCounts.has(seed)) {
                seedCounts.set(seed, []);
            }

            seedCounts.get(seed).push(count);
        }
    }

    const poolMedian = median(poolCounts);

    // Calculate one reference median per main seed
    const seedMedians = new Map();

    for (const [seed, values] of seedCounts) {

        if (values.length >= MIN_SCENE_SIZE) {
            seedMedians.set(seed, median(values));
        } else {
            seedMedians.set(seed, poolMedian);
        }
    }

    const adjusted = [];

    for (const candidate of pool) {

        if (
            candidate == null ||
            typeof candidate !== "object" ||
            typeof candidate.name !== "string" ||
            candidate.name.trim() === "" ||
            !Number.isFinite(candidate.score)
        ) {
            continue;
        }

        const count = counts.has(candidate)
            ? counts.get(candidate)
            : null;

        const seed = candidate.because?.[0]?.source;
        const reference = seedMedians.get(seed) ?? poolMedian;

        let factor = 1;

        if (
            count !== null &&
            count > 0 &&
            reference !== null &&
            reference > 0
        ) {
            factor = Math.pow(reference / count, strength);

            factor = Math.max(
                MIN_FACTOR,
                Math.min(MAX_FACTOR, factor)
            );

            // Do not boost artists below the listener threshold
            if (count < MIN_LISTENERS) {
                factor = Math.min(factor, 1);
            }
        }

        adjusted.push({
            ...candidate,
            listeners: count,
            similarity: candidate.score,
            score: candidate.score * factor
        });
    }

    // Same score and alphabetical tie-breaking as sortByScore
    adjusted.sort((a, b) => {

        if (b.score !== a.score) {
            return b.score - a.score;
        }

        return a.name.localeCompare(b.name, "en");
    });

    return adjusted;
}