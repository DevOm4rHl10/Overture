import { getAccessToken } from "./auth.js";

export async function spotifyGet(path) {
  const token = await getAccessToken();
  if (!token) throw new Error("NOT_LOGGED_IN");

  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${await res.text()}`);
  return res.json();
}