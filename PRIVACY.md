# Overture privacy policy

_Last updated: 21 November 2026_

Overture is a Chrome extension that recommends music artists you haven't heard yet, based on artists you choose. This page explains what data it uses and where that data goes.

## The short version

- Overture has no server. Everything runs in your browser.
- Nothing is sold, shared for advertising, or used for anything other than your recommendations.
- The only services Overture talks to are Last.fm (for similar artists) and, if you connect it, Spotify.

## What Overture uses

**Artists you type.** The names you add in the popup are saved in your browser (`chrome.storage.local`) so they're still there next time. To find similar artists, each name is sent to the Last.fm API.

**Spotify, if you connect it.** Spotify sign-in is optional and currently invite-only. If you connect, Overture asks Spotify for one permission, `user-top-read`, and reads:
- your top artists (up to 50, for the time range you pick), to use as your starting point;
- your Spotify display name (or your Spotify user ID if you have no display name), to show "Connected as …" in the popup.

The access and refresh tokens Spotify returns are saved in your browser so you stay signed in. Your top artist names are sent to the Last.fm API to find similar artists. Overture never reads your playlists, saved music, followers, email address or play history beyond your top artists, and it never changes anything in your Spotify account.

**Settings.** Your chosen mode, time range and source, and whether you've seen the tutorial, are saved in your browser.

**A one-day cache.** Last.fm answers (similar artists, listener counts) are kept in your browser for 24 hours, so a second search is instant and Last.fm isn't asked twice. Entries expire on their own.

## Where data goes

| Data | Sent to | Why |
|---|---|---|
| Artist names (typed or from Spotify) | Last.fm API (`ws.audioscrobbler.com`) | To find similar artists and their listener counts |
| Spotify sign-in and token refresh | Spotify (`accounts.spotify.com`) | To connect your account, only if you choose to |
| Request for your top artists and display name | Spotify Web API (`api.spotify.com`) | To use your top artists, only if you connect |

Last.fm and Spotify handle these requests under their own privacy policies: [Last.fm](https://www.last.fm/legal/privacy) and [Spotify](https://www.spotify.com/legal/privacy-policy/). Overture's developer receives none of this data.

No analytics, tracking, cookies or third-party scripts are included.

## Deleting your data

- **Disconnect Spotify** in the popup to delete the saved Spotify tokens. You can also remove Overture's access from your Spotify account page under "Manage apps".
- **Remove the extension** to delete everything it saved in your browser: artists, settings, tokens and cache.

## Children

Overture is not directed at children under 13 and does not knowingly collect data from them.

## Changes

If this policy changes, the new version will be published at this address with a new date at the top.

## Contact

Questions about this policy: open an issue at [github.com/DevOm4rHl10/Overture/issues](https://github.com/DevOm4rHl10/Overture/issues).
