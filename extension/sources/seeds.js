import { normalizeArtistList } from "../shared/normalize.js";


export async function loadArtists(arr)
{
    // Clean the list and remove duplicates
    const processedArray = normalizeArtistList(arr);

    // Assign a default weight to every artist
    const arrWithWeights = [];

    for (let i = 0; i < processedArray.length; i++)
    {
        arrWithWeights.push({
            name: processedArray[i],
            weight: 1.0
        });
    }

    return arrWithWeights;
}