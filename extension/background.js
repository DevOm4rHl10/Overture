
import { login, logout, getAccessToken } from "./auth.js";
import { spotifyGet } from "./spotify.js";
import { loadArtists as loadSpotify } from "./sources/spotify.js";
import { buildSimilarityGraph } from "./similarity.js";
import { buildPool, rankPool } from "./ranking.js";
import { getListenerCounts } from "./artistInfo.js";

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

    async TEST_SOURCE() {
        const artists = await loadSpotify();
        return { artists };
    },

    async TEST_GRAPH() {
        const artists = await loadSpotify();
        const result = await buildSimilarityGraph(artists);
        return result;
    },

    async TEST_POOL() {
        const sourceArtists = await loadSpotify();
        const { graph } = await buildSimilarityGraph(sourceArtists);

        console.time("buildPool");
        const pool = buildPool(graph, sourceArtists);
        console.timeEnd("buildPool");

        return { pool };
    },

    async TEST_RANKING(message) {
      const sourceArtists = await loadSpotify();
      const { graph, skipped } = await buildSimilarityGraph(sourceArtists);

      console.time("buildPool");
      const pool = buildPool(graph, sourceArtists);
      console.timeEnd("buildPool");

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
