export async function cacheSet(key, value, ttlMs) {

    if (typeof key !== "string" || key.trim() === "") {
        throw new TypeError("Cache key must be a non-empty string");
    }

    if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs) || ttlMs <= 0) {
        throw new TypeError("TTL must be a finite number greater than 0");
    }

    if (value === null || value === undefined) {
        throw new TypeError("Cache value cannot be null or undefined");
    }

    const entry = {
        value: value,
        expiresAt: Date.now() + ttlMs
    };

    await chrome.storage.local.set({
        [key]: entry
    });
}


export async function cacheGet(key) {

    if (typeof key !== "string" || key.trim() === "") {
        throw new TypeError("Cache key must be a non-empty string");
    }

    const result = await chrome.storage.local.get(key);

    const entry = result[key];

    // Missing entry
    if (entry == null) {
        return null;
    }

    // Invalid entry
    if (
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        !Number.isFinite(entry.expiresAt) ||
        !("value" in entry) ||
        entry.value === null ||
        entry.value === undefined
    ) {
        return null;
    }

    // Expired entry
    if (Date.now() >= entry.expiresAt) {
        return null;
    }

    return entry.value;
}