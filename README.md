# Overture

**Discover artists you haven't heard yet, based on what you already love.**

Overture is a Chrome extension that looks at your listening history and recommends artists similar to your favourites, minus the ones you already know. Every recommendation explains itself: *"because you listen to X and Y"*.

> **Status:** in development. Not yet on the Chrome Web Store. See [`TODO.md`](TODO.md) for progress.

---

## How it works

```
Listening data                Similarity               Ranking                   Popup
──────────────                ──────────               ───────                   ─────
Spotify           ┐
                  ├─▶ [{ name, weight }] ─▶ Last.fm artist.getSimilar ─▶ score, filter ─▶ recommendations
Typed artists     ┘                         + listener counts             already-heard,
                                                                          explain "because"
```

1. **Data sources** turn your listening into a weighted list of artists. Every source returns the same shape, so the rest of the pipeline doesn't care where the data came from.
   - **Spotify:** your top 50 artists over the last ~6 months (`medium_term`). Spotify gives an order, not play counts, so the weight comes from rank with a harmonic curve: `weight = 1 / (rank + 1)` (#1 = 1, #2 = 0.5, #3 = 0.33…). Your favourites lead clearly, and the curve doesn't depend on how many artists you have.
   - **Typed artists:** for anyone without Spotify. Every artist you type counts equally (weight 1).
2. **Similarity** asks Last.fm which artists are similar to your top artists. Users never need a Last.fm account: Overture calls Last.fm with its own API key.
3. **Ranking** scores candidates by how strongly they connect to what you love, removes artists you already listen to, and keeps track of *why* each one was picked.
4. **The popup** only reads the ranking output.

### Data contract

| Stage | Output |
|---|---|
| Every data source | `[{ name, weight }]` |
| Ranking engine | `[{ name, score, listeners, because, lastfmUrl }]` |

---

## Matching artist names across languages

Overture must recognize an artist you already know, even when Spotify and Last.fm write their name differently. Spotify might say `Klava Koka` while Last.fm recommends `Клава Кока`: without matching, Overture would "discover" an artist you already listen to.

Before writing any fix, the problem was **measured** on real Last.fm data (`experiments/`): **14,690 top artists from 157 tags in 57 language groups**, and the 15 similar artists of each one.

### What the measurements showed

- **Looking artists up works in every script:** 3 "not found" out of 14,690.
- **Latin-script languages have almost no problem** (English, Spanish, French, German, Nordic, Turkish, Swahili, Afrikaans…).
- **Cross-script duplicates concentrate** in Greek, Hebrew, Japanese, Russian/Cyrillic, Chinese, Arabic (Gulf music), Thai, Korean, Bulgarian/Macedonian, Kazakh/Kyrgyz, Khmer/Burmese and Ethiopian.
- **MusicBrainz IDs can't fix it:** among 1,159 suspicious pairs, they confirmed 0 duplicates (903 pairs had no ID on one side).
- **Last.fm's similarity score is relative:** 99% of similar-artist lists start at exactly 1.
- **A Last.fm bug:** its API decodes names twice, so every artist with a `+` (Florence + the Machine, Ich + Ich…) landed on a broken page. Fixed in `extension/lastfm.js` by escaping `+` and `%` once more.

### The solution: two layers

1. **Layer 1, normalization** (`shared/normalize.js`): trim, Unicode NFKC, lowercase. Catches case, spacing and invisible Unicode differences.
2. **Layer 2, transliteration** (`shared/transliterate.js`): only when one name is Latin and the other is Cyrillic, Greek, Armenian, Georgian or Arabic script. Both names become a rough Latin comparison key, never shown or stored. Arabic uses consonants only, because short vowels aren't written (محمد = Mohammad = Muhammad = Mohamed → `mhmd`).

**Rule: zero false merges.** Wrongly hiding a real discovery is worse than occasionally showing a duplicate. On real data, one-word names merged different artists (Anastasia ↔ Анастасија, Wiktoria ↔ Виктория), so **Layer 2 never matches one-word names**. Result: **172 cross-script pairs merged** on 32,264 names, reviewed by hand, **0 false merges found**.

### Known limits

- **One-word names** across scripts are not matched (Ceca / Цеца, Preslava / Преслава): the price of zero false merges.
- **Chinese, Japanese, Korean, Thai, Hebrew** and other scripts are outside Layer 2: limited support.
- **Homonyms** (several bands called Nirvana) can't be told apart by name; Last.fm merges them onto one page.
- **Some letters aren't mapped yet** (Kazakh ә ғ қ…, Urdu ٹ ڈ…): those names are missed, never wrongly merged.

Every case, including each false merge found on real data, is a test in `tests/transliteration.test.js`.

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
│   │   ├── normalize.js     ← name matching, Layer 1
│   │   └── transliterate.js ← name matching across scripts, Layer 2
│   ├── sources/             ← data source adapters
│   │   ├── seeds.js         ← artists typed by the user
│   │   ├── spotify.js       ← Spotify top artists
│   │   └── lastfm.js        ← Last.fm username (planned)
│   ├── lastfm.js            ← Last.fm API wrapper (similarity data)
│   └── popup/               ← the extension's UI
├── tests/                   ← unit tests, offline (Node's built-in test runner)
│   └── e2e/                 ← end-to-end test against the real APIs
├── experiments/             ← measurement scripts and their results
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
node --test                               # unit tests: offline, fast (193 tests)
node --test tests/e2e/pipeline.e2e.js     # end-to-end: real Last.fm API, ~30 s
```

Run them from the repo root. The unit tests replace the network and Chrome with fakes, so they need no key. The end-to-end test uses your Last.fm key; add `SPOTIFY_ACCESS_TOKEN=<token>` in front to include your Spotify account (see the top of the file).

### 5. Experiments (optional)

```bash
node experiments/name-matching.js --set core     # ~2 h the first time, cached after
node experiments/name-matching.js --set world    # ~5 h, 40 more language groups
node experiments/layer2-check.js                 # every cross-script merge, for review
node experiments/plus-sign-check.js              # the Last.fm "+" bug
```

Results go to `experiments/output*/` (`summary.md`, CSV files). Every Last.fm answer is cached, so runs can be stopped and resumed.

---

## Known limitations

- **Spotify is capped at 5 users.** Spotify's Development Mode only allows 5 manually approved accounts. Everyone else can use typed artists. A planned fix: let users upload their own Spotify data export, which has no user cap and includes real play counts.
- **Name matching has known limits:** one-word names across scripts, Chinese/Japanese/Korean/Thai/Hebrew, homonyms, Arabic spelling variants within Arabic script (alef forms, tashkeel). See [Matching artist names across languages](#matching-artist-names-across-languages).
- **Last.fm knows less about some music.** Median listeners range from 2.5M (English) to a few hundred (Swahili, Khmer, Amazigh); many African and South Asian artists have few tags and no bio. Recommendations are thinner there.
- **The Last.fm API key ships with the extension.** Any client-side app exposes its keys to users who inspect it. The key is read-only and rate-limited by Last.fm.

---

## Credits

Built by Omar as a learning project.

The data sources, the Last.fm API wrapper, name normalization, similarity fetching, ranking engine and the data-science decisions are my own work. [Claude](https://claude.ai) (Anthropic) wrote the Spotify authentication and sign-in, the cross-script name matching (transliteration), the unit tests, the experiment scripts, the popup UI, the documentation, and the Chrome Web Store deployment, and mentored the rest through explanations and code review.

Recommendations powered by [Last.fm](https://www.last.fm/api).

## License

See [`LICENSE`](LICENSE).