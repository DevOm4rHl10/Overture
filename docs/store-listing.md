# Chrome Web Store: listing and release checklist

Everything to paste into the developer dashboard, in the order the dashboard asks for it.

## Release checklist

1. **Clean up `background.js`:** delete the `TEST_SOURCE`, `TEST_GRAPH`, `TEST_POOL` and `TEST_RANKING` handlers and the `console.time` / `console.timeEnd` lines.
2. **Trim the Spotify scopes** in `extension/config.js` to `["user-top-read"]` (the only one Overture uses). Then disconnect and reconnect Spotify once, so the token has the new scope list.
3. **Build:** `node scripts/build.js`. It runs the tests, checks the config and the handlers, and writes `dist/overture-<version>.zip`. Never commit `dist/`: the zip contains your API keys.
4. **Upload** the zip: dashboard → *Add new item*.
5. **Fill in the tabs** with the text below (Store listing, Privacy, Distribution).
6. **Spotify redirect URI:** the Store gives the extension a new ID (different from your unpacked one). Copy it from the dashboard and add `https://<store-id>.chromiumapp.org/` under *Redirect URIs* in the Spotify developer dashboard. Keep the old one for your unpacked development copy.
7. **Invite testers:** add your friends' Spotify emails under *User Management* in the Spotify dashboard (5 accounts at most).
8. **Submit for review.** Reviews usually take a few days. Publishing can be set to *manual*, so you choose when it goes live after approval.

For every later update: raise `"version"` in `extension/manifest.json`, build, upload.

---

## Store listing tab

**Name:** Overture

**Summary** (132 characters max):
> Discover artists you haven't heard yet, picked from the ones you love. In any language, from famous to hidden gems.

**Category:** Entertainment

**Language:** English

**Description:**
> Overture finds new artists for you, starting from the ones you already love.
>
> Type a few artists, in any language or script, and pick how adventurous you feel:
> • Popular: the closest, best-known matches
> • Balanced: a mix of known names and new faces
> • Hidden gems: the least-known artists of each scene
>
> Each recommendation tells you why it was picked ("Because you listen to…"). Click a name to find the artist on Spotify, or the listener count to open their Last.fm page. Not feeling them? "Show me others" brings the next ones.
>
> Overture understands that Клава Кока and Klava Koka are the same artist, so you won't be recommended someone you already know just because their name is written in another alphabet. Hidden gems are measured within each scene, so a small artist from a big genre gets the same chance as one from a niche.
>
> Spotify sign-in is available for invited testers: Spotify limits apps in testing to 5 accounts. Typed artists work for everyone.
>
> Private by design: Overture has no server. It runs in your browser and only talks to Last.fm (for similar artists) and Spotify (if you connect it). No tracking, no ads.
>
> Similar artists and listener counts from Last.fm. Open source: github.com/DevOm4rHl10/Overture

**Graphic assets:**
- Icon 128×128: `extension/icons/icon128.png`
- Small promo tile 440×280: `docs/promo-tile-440x280.png`
- Screenshots, 1280×800 or 640×400, 1 to 5. Suggested: the setup screen with a few typed artists; results in Hidden gems; the tutorial's first step. Take them from the real extension (not mock data), then frame them on the sky-blue background (`#A9D3F5`) at 1280×800.

**Official URL / Homepage:** `https://github.com/DevOm4rHl10/Overture`

**Support URL:** `https://github.com/DevOm4rHl10/Overture/issues`

---

## Privacy tab

**Single purpose:**
> Overture recommends music artists the user hasn't heard yet, based on artists the user types or, for invited testers, their Spotify top artists.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `identity` | Used only for the optional Spotify sign-in (OAuth with PKCE through `chrome.identity.launchWebAuthFlow`). |
| `storage` | Saves the user's typed artists, settings, Spotify sign-in tokens, and a 24-hour cache of Last.fm answers, locally in the browser. |
| Host `https://ws.audioscrobbler.com/*` | The Last.fm API: similar artists and listener counts, the core of the recommendations. |
| Host `https://accounts.spotify.com/*` | Spotify sign-in: exchanging and refreshing the OAuth token, only if the user connects Spotify. |
| Host `https://api.spotify.com/*` | Reading the user's top artists and display name, only if the user connects Spotify. |

**Remote code:** No, I am not using remote code. (All JavaScript is in the package.)

**Data usage: what the extension collects.** Tick:
- **Personally identifiable information:** Spotify display name (shown as "Connected as …"), only with Spotify.
- **Authentication information:** Spotify access and refresh tokens, stored locally, only with Spotify.
- **User activity:** the user's top artists (Spotify) or the artists they type, used to compute recommendations.

Leave everything else unticked (health, financial, personal communications, location, web history, website content).

**Certify all three:**
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://github.com/DevOm4rHl10/Overture/blob/main/PRIVACY.md`

---

## Distribution tab

- **Visibility:** Public (or *Unlisted* first, if you'd rather share the link with friends before anyone can find it).
- **Regions:** All regions.
- **Pricing:** Free.
