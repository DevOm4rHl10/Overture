
// Normalize one artist name
// Expects a string as input
export function normalizeArtist(name)
{
    if (typeof name !== "string")
    {
        throw new TypeError("Artist name must be a string");
    }
    return name.trim().normalize("NFKC").toLowerCase();
}


// Clean a list of artist names and remove duplicates
export function normalizeArtistList(names)
{
    if (!Array.isArray(names))
    {
        throw new TypeError("Input must be an array");
    }
    const uniqueArtists = new Map();

    
    for (let i = 0; i < names.length; i++)
    {
        const elem = names[i];

        // Check that the element is a string
        if (typeof elem !== "string") continue;

        // Trim the name
        const trimmedName = elem.trim();

        // Ignore empty names
        if (trimmedName === "") continue;

        // Generate the normalized key
        const key = normalizeArtist(trimmedName);

        // Add only if the artist does not already exist
        if (!uniqueArtists.has(key))
        {
            uniqueArtists.set(key, trimmedName);
        }
    }

    // Convert the Map values into an array
    const result = Array.from(uniqueArtists.values());

    return result;
}