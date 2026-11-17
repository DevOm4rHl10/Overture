import { SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES } from "./config.js";

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const STORAGE_KEY = "spotifyTokens";

// ---------- PKCE helpers ----------

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return base64url(bytes).slice(0, length);
}

async function sha256(text) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

// ---------- Token storage ----------

async function saveTokens(response, previousRefreshToken) {
  const tokens = {
    accessToken: response.access_token,
    // Spotify doesn't always send a new refresh token; keep the old one if not.
    refreshToken: response.refresh_token ?? previousRefreshToken,
    // Refresh 60 seconds early to avoid using a token right as it expires.
    expiresAt: Date.now() + (response.expires_in - 60) * 1000,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: tokens });
  return tokens;
}

async function requestToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, ...body }),
  });
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ---------- Public API ----------

export async function login() {
  const verifier = randomString(64);
  const challenge = base64url(await sha256(verifier));
  const state = randomString(16); // protects against forged redirects
  const redirectUri = chrome.identity.getRedirectURL();

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES.join(" "),
    state,
  });

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: `${AUTH_URL}?${params}`,
    interactive: true,
  });

  const returned = new URL(responseUrl).searchParams;
  if (returned.get("error")) throw new Error(`Spotify said: ${returned.get("error")}`);
  if (returned.get("state") !== state) throw new Error("State mismatch, login aborted");

  const tokens = await requestToken({
    grant_type: "authorization_code",
    code: returned.get("code"),
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  await saveTokens(tokens);
}

export async function getAccessToken() {
  const { [STORAGE_KEY]: tokens } = await chrome.storage.local.get(STORAGE_KEY);
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;

  try {
    const fresh = await requestToken({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
    return (await saveTokens(fresh, tokens.refreshToken)).accessToken;
  } catch (err) {
    console.warn("Refresh failed, logging out:", err);
    await logout();
    return null;
  }
}

export async function logout() {
  await chrome.storage.local.remove(STORAGE_KEY);
}