export const BASE_URL = "https://ws.audioscrobbler.com/2.0/?";
import { LASTFM_API_KEY } from "./config.js";

export class LastfmError extends Error
{
    constructor(code, message, cause)
    {
        super(message, { cause : cause} ); // Call the parent's constructor

        this.name = "LastFmError";
        this.code = code;
    }
}



function validateArgs(method, params)
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


function buildUrl(method, params){

    
    //The validate already handles the checking. No need to do it again
    let parsedParams = new URLSearchParams();

    let container = Object.entries(params);
    for (let [key, value] of container)
    {
        if (value == null) continue;
        parsedParams.append(String(key), value);

    }
    parsedParams.set("method", method);
    parsedParams.set("api_key", LASTFM_API_KEY);
    parsedParams.set("format", "json");

    const query = parsedParams.toString();
    return BASE_URL + query;

}


/*
let method = "artist.getinfo";
let apiKey = "12345";

let url = `https://ws.audioscrobbler.com/2.0/?method=${method}&api_key=${apiKey}`;
*/