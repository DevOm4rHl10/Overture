
import { login, logout, getAccessToken } from "./auth.js";
import { spotifyGet } from "./spotify.js";
import { loadArtists as loadSpotify } from "./sources/spotify.js";
import { buildSimilarityGraph } from "./similarity.js";
import { buildPool, rankPool } from "./ranking.js";
import { getListenerCounts } from "./artistInfo.js";
import { loadArtists as loadSeeds } from "./sources/seeds.js";


const handlers = {
  
    async STATUS() {
        if (!(await getAccessToken())) return { loggedIn: false };
        const me = await spotifyGet("/me");
        return { loggedIn: true, name: me.display_name ?? me.id };
    },

    async CONNECT_SPOTIFY() {
        await login();
        return handlers.STATUS();
    },

    async DISCONNECT() {
        await logout();
        return { loggedIn: false };
    },

    async GET_RECOMMENDATIONS(message) {
    const sourceArtists = message.source === "typed"
        ? await loadSeeds(message.artists)
        : await loadSpotify({ timeRange: message.timeRange });

    const { graph, skipped } = await buildSimilarityGraph(sourceArtists);

    
    const pool = buildPool(graph, sourceArtists);
    

    const listeners = await getListenerCounts(
        pool.map(candidate => candidate.name)
    );

    const recommendations = rankPool(
        pool,
        listeners,
        message.strength
    );

    return { recommendations, skipped };
},


};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const handler = handlers[msg.type];
    if (!handler) return;

    handler(msg)
        .then((data) => sendResponse({ ok: true, ...data }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));

    return true;
});
