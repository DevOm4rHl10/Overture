import { login, logout, getAccessToken } from "./auth.js";
import { spotifyGet } from "./spotify.js";
import { loadArtists as loadSpotify} from "./sources/spotify.js";
import { buildSimilarityGraph } from "./similarity.js";

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

  async TEST_SOURCE(){
    const artists = await loadSpotify();
    return {artists : artists};
  },

  async TEST_GRAPH(){
    const artists = await loadSpotify(); 
    const graph = await buildSimilarityGraph(artists);
    return graph;
  },

};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg.type];
  if (!handler) return;

  handler()
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true; // keeps the channel open for the async response
});

