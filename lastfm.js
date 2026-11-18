export const BASE_URL = "https://ws.audioscrobbler.com/2.0/?";
import { LASTFM_API_KEY } from "config.js";

export class LastFmError extends Error
{
    constructor(code, message, cause)
    {
        super(message, { cause : cause} ); // Call the parent's constructor

        this.name = "LastFmError";
        this.code = code;
    }
}



function validateArgs(method, params){
    if (typeof method !== "string"){
        throw new TypeError("Method must be a string");
    }

    if (params == null) {
        throw new TypeError("Params can't be null");
    }

     // check that its an object
    if (typeof params !== "object"){
        throw new TypeError("Params must be an object");
    }

    // now that its not null, check empty array or empty object
    if (Object.keys(params).length == 0)
    {
        throw new TypeError("Params can't be empty");
    }

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