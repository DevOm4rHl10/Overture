
import { spotifyGet } from "../spotify.js";
import { normalizeArtistList } from "../shared/normalize.js";


const VALID_TIME_RANGES = ["short_term", "medium_term", "long_term"];


// Load the user's top Spotify artists
export async function loadArtists(options = {})
{
    // Check that options is an object, not null or an array
    if (typeof options !== "object" || options === null || Array.isArray(options))
    {
        throw new TypeError("Options must be an object");
    }

    // Get the time range, defaulting only when it is undefined
    const timeRange = options.timeRange === undefined
        ? "medium_term"
        : options.timeRange;

    // Check that timeRange is valid
    if (!VALID_TIME_RANGES.includes(timeRange))
    {
        throw new TypeError("Invalid time range");
    }

    // Build request parameters
    const params = new URLSearchParams();
    params.set("time_range", timeRange);
    params.set("limit", "50");

    // Request the user's top artists
    const body = await spotifyGet(`/me/top/artists?${params.toString()}`);

    // Check that items exists and is an array
    if (!Array.isArray(body?.items))
    {
        return [];
    }

    // Extract artist names
    const names = body.items.map(artist => artist?.name);

    // Normalize names (remove invalid entries and duplicates)
    const artists = normalizeArtistList(names);

    // Assign weights based on rank
    const result = artists.map((name, rank) => ({
        name,
        weight: 1 / (rank + 1)
    }));

    return result;
}
