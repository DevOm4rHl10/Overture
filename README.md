# Overture

**Discover artists you haven't heard yet, based on what you already love.**

Overture is a Chrome extension that looks at your listening history and recommends artists similar to your favourites, minus the ones you already know. Every recommendation explains itself: *"because you listen to X and Y"*.

> **Status:** in development. Not yet on the Chrome Web Store. See [`TODO.md`](TODO.md) for progress.

---

## How it works

```
Listening data                Similarity               Ranking                   Popup
──────────────                ──────────               ───────                   ─────
Last.fm username  ┐
Typed artists     ├─▶ [{ name, weight }] ─▶ Last.fm artist.getSimilar ─▶ score, filter ─▶ recommendations
Spotify (beta)    ┘                         + listener counts             already-heard,
                                                                          explain "because"
```

1. **Data sources** turn your listening into a weighted list of artists. Every source returns the same shape, so the rest of the pipeline doesn't care where the data came from.
2. **Similarity** asks Last.fm which artists are similar to your top artists.
3. **Ranking** scores candidates by how strongly they connect to what you love, removes artists you already listen to, and keeps track of *why* each one was picked.
4. **The popup** only reads the ranking output.

### Data contract

| Stage | Output |
|---|---|
| Every data source | `[{ name, weight }]` |
| Ranking engine | `[{ name, score, listeners, because, lastfmUrl }]` |

---

## Project structure

```
Overture/
├── extension/               ← the folder Chrome loads ("Load unpacked")
│   ├── manifest.json
│   ├── background.js        ← service worker: coordinates everything
│   ├── auth.js              ← Spotify login (OAuth 2.0 + PKCE)
│   ├── spotify.js           ← Spotify Web API wrapper
│   ├── config.js            ← YOUR keys (git-ignored, see Setup)
│   ├── shared/
│   │   └── normalize.js     ← artist name matching
│   ├── sources/             ← data source adapters
│   │   ├── seeds.js         ← artists typed by the user
│   │   ├── lastfm.js        ← Last.fm listening history
│   │   └── spotify.js       ← Spotify listening history (beta)
│   └── popup/               ← the extension's UI
├── tests/                   ← unit tests (Node's built-in test runner)
├── config.example.js        ← template for extension/config.js
└── key.pem                  ← private key, git-ignored, never shipped
```

Only `extension/` is loaded by Chrome. Docs, tests and keys live outside it so they're never shipped.

---

## Setup for developers

### Requirements
- Google Chrome (or another Chromium browser)
- [Node.js](https://nodejs.org/) 22 or newer, for running tests
- A [Last.fm API account](https://www.last.fm/api/account/create) (free)
- *Optional, for the Spotify source:* a **Spotify Premium** account. Spotify requires Premium for apps in Development Mode.

### 1. Clone and configure

```bash
git clone <repo-url>
cd Overture
cp config.example.js extension/config.js
```

Open `extension/config.js` and fill in your own values.

> **Why `config.example.js`?** `extension/config.js` holds real API keys, so it's listed in `.gitignore` and never committed. `config.example.js` is the committed template: same structure, placeholder values. **If you add a new setting to `config.js`, add it to `config.example.js` too**, with a placeholder, so other developers know it exists.

You don't need any client secret: Spotify login uses PKCE, and Last.fm calls only read public data.

### 2. Load the extension

1. Go to `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select the **`extension/`** folder (not the repo root)

The extension ID stays the same on every machine, because the public key is pinned in `manifest.json` (`"key"`).

### 3. Spotify (optional)

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and tick **Web API**.
2. Find your redirect URI: on the extension's card in `chrome://extensions`, click **service worker** and read the console. It looks like `https://<extension-id>.chromiumapp.org/`.
3. Add it to your Spotify app's **Redirect URIs**, exactly as printed (trailing slash included).
4. Under **User Management**, add the email of every Spotify account that will log in (maximum 5 in Development Mode).
5. Put your **Client ID** in `extension/config.js`.

### 4. Run the tests

```bash
node --test
```

Run it from the repo root; Node finds every `*.test.js` file automatically.

---

## Known limitations

- **Spotify is capped at 5 users.** Spotify's Development Mode only allows 5 manually approved accounts, which is why Last.fm and typed artists are the main sources.
- **Artist name matching is basic.** Names are matched after trimming, Unicode normalization (NFKC) and lowercasing. Transliterations (`فيروز` / `Fairuz`), Arabic spelling variants (alef forms, tashkeel), stripped accents and invisible characters are not matched yet. Every case is documented in `tests/normalize.test.js` under *Known limitations*.
- **The Last.fm API key ships with the extension.** Any client-side app exposes its keys to users who inspect it. The key is read-only and rate-limited by Last.fm.

---

## Credits

Built by Omar as a learning project.

The data sources, similarity fetching, ranking engine and all data-science logic are my own work. [Claude](https://claude.ai) (Anthropic) wrote the Spotify authentication and sign-in, the unit tests, the popup UI, the documentation, and the Chrome Web Store deployment, and mentored the rest through explanations and code review.

Recommendations powered by [Last.fm](https://www.last.fm/api).

## License

See [`LICENSE`](LICENSE).