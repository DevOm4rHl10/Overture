import { LASTFM_API_KEY } from "./config.js";
const BASE_URL = "https://ws.audioscrobbler.com/2.0/?";


export class LastfmError extends Error
{
    constructor(code, message, cause)
    {
        super(message, { cause : cause} ); // Call the parent's constructor

        this.name = "LastfmError";
        this.code = code;
    }
}



export function validateArgs(method, params)
{
    // Check that method is a non-empty string
    if (typeof method !== "string" || method.trim() === "")
    {
        throw new TypeError("Method must be a non-empty string");
    }

    // Reject null or undefined
    if (params == null)
    {
        throw new TypeError("Params cannot be null");
    }

    // Check that params is an object, not an array
    if (typeof params !== "object" || Array.isArray(params))
    {
        throw new TypeError("Params must be an object");
    }

    // Empty objects are allowed
}


export function buildUrl(method, params)
{
    let parsedParams = new URLSearchParams();

    let container = Object.entries(params);
    for (let [key, value] of container)
    {
        if (value == null) continue;

        const safeValue = String(value)
            .replace(/%/g, "%25")
            .replace(/\+/g, "%2B");

        parsedParams.append(key, safeValue);
    }

    parsedParams.set("method", method);
    parsedParams.set("api_key", LASTFM_API_KEY);
    parsedParams.set("format", "json");

    const query = parsedParams.toString();
    return BASE_URL + query;
}


async function sendRequest(url)
{
    try {
        const response = await fetch(url);
        return response;
    } catch (error) {
        throw new LastfmError(
            "NETWORK",
            "Could not reach Last.fm",
            error
        );
    }
}


async function parseBody(response)
{
    try {
        const data = await response.json();

        if (data === null || typeof data !== "object" || Array.isArray(data))
        {
            throw new Error("Response body must be a JSON object");
        }

        return data;

    } catch (error) {
        throw new LastfmError(
            "BAD_RESPONSE",
            "Could not parse Last.fm response",
            error
        );
    }
}


function checkForErrors(body, response)
{
    const error = body.error;

    // Check whether Last.fm returned an API error
    if (error != null)
    {
        throw new LastfmError(
            error,
            body.message || "Last.fm API request failed"
        );
    }

    // Check HTTP response status
    if (!response.ok)
    {
        throw new LastfmError(
            "BAD_RESPONSE",
            `Last.fm returned HTTP status ${response.status}`
        );
    }
}


export async function lastfmGet(method, params = {})
{
    validateArgs(method, params);

    const requestUrl = buildUrl(method, params);
    const response = await sendRequest(requestUrl);
    const data = await parseBody(response);

    checkForErrors(data, response);

    return data;
}

/*
let method = "artist.getinfo";
let apiKey = "12345";

let url = `https://ws.audioscrobbler.com/2.0/?method=${method}&api_key=${apiKey}`;
*/