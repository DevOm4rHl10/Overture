# Overture

**Discover artists you haven't heard yet, based on what you already love.**

Overture is a Chrome extension that looks at your listening history and recommends artists similar to your favourites, minus the ones you already know. Every recommendation explains itself: *"because you listen to X and Y"*.

It is built for listeners whose music isn't only in English: the name matching works across Cyrillic, Greek, Arabic, Armenian and Georgian scripts, and "less known" is judged relative to each music scene, not against one global chart.

> **Status:** working end to end: engine, popup and 718 unit tests + a live end-to-end test. Not yet on the Chrome Web Store. See the [Roadmap](#roadmap).

---

## How it works

```
Listening data          Similarity                 Ranking                                   Popup
──────────────          ──────────                 ───────                                   ─────
Spotify       ┐
              ├─▶ [{ name, weight }] ─▶ Last.fm getSimilar ─▶ score · remove known · merge ─▶ 20 artists
Typed artists ┘                         (cached 1 day)         duplicates · cap per seed ·     + "because…"
                                                               obscurity (Last.fm getInfo)
```

1. **Data sources** turn your listening into a weighted list of artists. Every source returns the same shape, so the rest of the pipeline doesn't care where the data came from.
   - **Spotify:** your top 50 artists over the last ~6 months (`medium_term`). Spotify gives an order, not play counts, so the weight comes from rank with a harmonic curve: `weight = 1 / (rank + 1)` (#1 = 1, #2 = 0.5, #3 = 0.33…).
   - **Typed artists:** for anyone without Spotify. Every artist you type counts equally (weight 1).
2. **Similarity** (`similarity.js`) asks Last.fm for the 15 artists most similar to each of yours. Users never need a Last.fm account: Overture uses its own API key. Calls run one after another and are cached for a day in `chrome.storage.local`, so a second run is near-instant.
3. **Ranking** (`ranking.js`) turns those lists into recommendations (details below).
4. **The popup** (`popup/`) asks for your music and a mode, then shows the results. While the first search runs (about 15 seconds), a pixel-art composer dances and the loading lines change on every run.

### Data contract

| Stage | Output |
|---|---|
| Every data source | `[{ name, weight }]` (top weight = 1) |
| Similarity | `{ graph: [{ source, weight, similar: [{ name, match, url, mbid }] }], skipped: [names] }` |
| Ranking engine | `[{ name, score, listeners, because: [{ source, contribution }], lastfmUrl }]` |

---

## Ranking: from similar artists to recommendations

| Step | What happens | Why |
|---|---|---|
| **Score** | Each candidate gets `match × weight` from every one of your artists that lists it, summed. | Artists recommended by several of your favourites rise. |
| **Remove known** | Any candidate that is one of your artists is dropped, even in another script (Layer 1 + 2, below). | Otherwise you'd "discover" artists you already know. |
| **Remove collaborations** | Pages like `BTS, Halsey` are dropped when one part is an artist you know. Names are split on `", "` only, never on `&`. | They aren't artists. Real duos (`Artik & Asti`, `Simon & Garfunkel`) stay. |
| **Merge duplicates** | `Юлианна Караулова` and `Yulianna Karaulova` become one candidate, with the reasons of both. | Last.fm often has two pages for one artist. |
| **Pool** | At most 5 candidates per seed, 40 in total. | Stops one favourite with a big similar list from filling everything. |
| **Obscurity** | Listener counts (Last.fm `getInfo`, cached) for the 40, then each score is multiplied by `(scene median / listeners) ^ strength`, clamped between 0.25 and 4. | See below. |
| **Final list** | At most 3 per seed, 20 in total; if there aren't enough seeds, the rest is filled up. | Variety. |

Every recommendation keeps its reasons (`because`), sorted by how much each of your artists contributed, so the popup can say *"because you listen to MIA BOYKA and Lusia Chebotina"*.

### Why obscurity, and why per scene

Last.fm's similar artists come from collaborative filtering, which is known to favour popular artists: popular artists' neighbours tend to be popular too ([Celma & Cano, 2008](https://mtg.upf.edu/files/publications/Celma-ACM-Netflix-KDD2008.pdf)). Left alone, Overture would mostly recommend what you'd hear anyway. So candidates are re-weighted by how known they are.

The question is *known compared to what*. Measured on real Last.fm data, the median artist has **2.5M listeners in English but around 5K in Arabic, and a few hundred in some African scenes**. One global threshold would call a whole scene "obscure". So each candidate is compared with **the other candidates that came from the same artist of yours** (its scene), falling back to the pool median when a scene has fewer than 3 counts. Pages under 50 listeners (often duplicates or dead pages) are never boosted.

This was tested on a real multi-scene profile (nasheed, Russian pop, ancient lyre music, Algerian rap) with six formulas and three strengths (`experiments/obscurity-compare.js`). With one median for everyone, the smallest scene looked obscure and took **12–13 of the 20 places whatever the formula**. That's why the reference is per scene, and why the caps exist. The power law was kept: one parameter, multiplicative (similarity still matters), and readable: at strength 0.5, an artist with 10× fewer listeners than its scene is worth about ×3.2.

### Discovery modes

The engine takes one setting, `strength` (0 = pure similarity). On real data, **strength 0.5 already gives nearly all the effect**: each seed's 3 least-known candidates out of its 5 are chosen, and strength 1 changed only 1 of the 20 artists. So the popup offers three buttons instead of a slider:

| Mode | Strength | What you get |
|---|---|---|
| Familiar | 0 | Close to what you already play |
| Balanced | 0.25 | A mix of known names and new faces |
| Hidden gems | 0.5 | The least-known artists of each scene (default) |

Switching mode on the results screen is instant: everything is already cached.

On that same profile, strength 0.5 lowered the median listeners of the 20 recommendations from about 17K to about 6K: Khaled (397K listeners) and Rilès (118K) gave way to Flenn and Danyl, from the same scene.

---

## Matching artist names across languages

Overture must recognize an artist you already know, even when Spotify and Last.fm write their name differently. Spotify might say `Klava Koka` while Last.fm recommends `Клава Кока`: without matching, Overture would "discover" an artist you already listen to.

Before writing any fix, the problem was **measured** on real Last.fm data (`experiments/`): **14,690 top artists from 157 tags in 57 language groups**, and the 15 similar artists of each one.

### What the measurements showed

- **Looking artists up works in every script:** 3 "not found" out of 14,690.
- **Latin-script languages have almost no problem** (English, Spanish, French, German, Nordic, Turkish, Swahili, Afrikaans…).
- **Cross-script duplicates concentrate** in Greek, Hebrew, Japanese, Russian/Cyrillic, Chinese, Arabic (Gulf music), Thai, Korean, Bulgarian/Macedonian, Kazakh/Kyrgyz, Khmer/Burmese and Ethiopian.
- **MusicBrainz IDs can't fix it:** among 1,159 suspicious pairs, they confirmed 0 duplicates (903 pairs had no ID on one side).
- **Last.fm's similarity score is relative:** 99% of similar-artist lists start at exactly 1. So the weight of *your* artist does most of the ranking work.
- **A Last.fm bug:** its API decodes names twice, so every artist with a `+` (Florence + the Machine, Ich + Ich…) landed on a broken page. Fixed in `extension/lastfm.js` by escaping `+` and `%` once more.

### The solution: two layers

1. **Layer 1, normalization** (`shared/normalize.js`): trim, Unicode NFKC, lowercase. Catches case, spacing and invisible Unicode differences.
2. **Layer 2, transliteration** (`shared/transliterate.js`): only when one name is Latin and the other is Cyrillic, Greek, Armenian, Georgian or Arabic script. Both names become a rough Latin comparison key, never shown or stored. Arabic uses consonants only, because short vowels aren't written (محمد = Mohammad = Muhammad = Mohamed → `mhmd`). Folding rules erase the usual spelling variants (`kh/h`, `y/i/j`, `ts/c`, `lyu/lu` so that Люся = Lusia…), and a rule is added only when a real pair needs it.

**Rule: zero false merges.** Wrongly hiding a real discovery is worse than occasionally showing a duplicate. On real data, one-word names merged different artists (Anastasia ↔ Анастасија, Wiktoria ↔ Виктория), so **Layer 2 never matches one-word names**. Result: **173 cross-script pairs merged** on 32,264 names, **0 false merges found**.

### Known limits

- **One-word names** across scripts are not matched (Ceca / Цеца, Kino / Кино): the price of zero false merges.
- **Chinese, Japanese, Korean, Thai, Hebrew** and other scripts are outside Layer 2: limited support (`방탄소년단` is not matched with `BTS`).
- **Homonyms** (several bands called Nirvana) can't be told apart by name; Last.fm merges them onto one page.
- **Some letters aren't mapped yet** (Kazakh ә ғ қ…, Urdu ٹ ڈ…): those names are missed, never wrongly merged.

Every case, including each false merge found on real data, is a test in `tests/transliterate.test.js`.

---

## Project structure

```
Overture/
├── extension/               ← the folder Chrome loads ("Load unpacked")
│   ├── manifest.json
│   ├── background.js        ← service worker: message handlers, runs the pipeline
│   ├── auth.js              ← Spotify login (OAuth 2.0 + PKCE)
│   ├── spotify.js           ← Spotify Web API wrapper
│   ├── lastfm.js            ← Last.fm API wrapper
│   ├── similarity.js        ← similar artists for each of yours (Last.fm getSimilar)
│   ├── artistInfo.js        ← listener counts (Last.fm getInfo)
│   ├── cache.js             ← 1-day cache in chrome.storage.local
│   ├── ranking.js           ← scoring, filtering, merging, obscurity, caps
│   ├── config.js            ← YOUR keys (git-ignored, see Setup)
│   ├── config.example.js    ← template for config.js
│   ├── shared/
│   │   ├── normalize.js     ← name matching, Layer 1
│   │   └── transliterate.js ← name matching across scripts, Layer 2
│   ├── sources/             ← data source adapters
│   │   ├── seeds.js         ← artists typed by the user
│   │   ├── spotify.js       ← Spotify top artists
│   │   └── lastfm.js        ← Last.fm username (planned)
│   ├── icons/               ← pixel-art icons (16, 32, 48, 128 px)
│   └── popup/               ← the extension's UI
│       ├── popup.html/.css/.js
│       ├── format.js        ← pure helpers (modes, listener counts, phrases), unit-tested
│       ├── pixel.js         ← draws pixel art as SVG, plus a 5×7 bitmap font for the title
│       └── sprites.js       ← the composer, his dance, notes and clouds, as pixel grids
├── tests/                   ← unit tests, offline (Node's built-in test runner)
│   └── e2e/                 ← end-to-end test against the real APIs
├── experiments/             ← measurement scripts and their results
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
cp extension/config.example.js extension/config.js
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
node --test                               # unit tests: offline, < 1 s (718 tests)
node --test tests/e2e/pipeline.e2e.js     # end-to-end: real Last.fm API, ~1–2 min
```

Run them from the repo root. The unit tests replace the network and Chrome with fakes, so they need no key. The end-to-end test runs the whole pipeline on real data with your Last.fm key; add `SPOTIFY_ACCESS_TOKEN=<token>` in front to include your Spotify account (see the top of the file).

### 5. Experiments (optional)

```bash
node experiments/name-matching.mjs --set core    # ~2 h the first time, cached after
node experiments/name-matching.mjs --set world   # ~5 h, 40 more language groups
node experiments/layer2-check.mjs                # every cross-script merge, for review
node experiments/plus-sign-check.js              # the Last.fm "+" bug
```

Results go to `experiments/output*/` (`summary.md`, CSV files). Every Last.fm answer is cached, so runs can be stopped and resumed.

Two experiments run in the browser instead (paste them into the extension's console, instructions at the top of each file):

- `experiments/obscurity-compare.js`: six obscurity formulas × three strengths on your real profile (popup console).
- `experiments/spotify-id-check.js`: can Spotify IDs match names across scripts? (service worker console).

---

## Known limitations

- **Spotify is capped at 5 users.** Spotify's Development Mode only allows 5 manually approved accounts. Everyone else can use typed artists.
- **Name matching has known limits:** one-word names across scripts, Chinese/Japanese/Korean/Thai/Hebrew, homonyms, Arabic spelling variants within Arabic script (alef forms, tashkeel). See [Known limits](#known-limits).
- **Acronyms and other official names leak through.** Typing `BTS` can recommend `Bangtan Sonyeondan`, a separate Last.fm page for the same group. Names alone can't link an acronym to a romanized name, and Korean script isn't covered by Layer 2. This mostly affects K-pop and J-pop. Planned fix: Spotify IDs (v1.1).
- **Group members count as new artists.** A BTS fan is recommended BTS members; the cap of 3 per seed limits how many.
- **Last.fm knows less about some music.** Many African and South Asian artists have few listeners, few tags and no bio. Recommendations are thinner there.
- **The first run takes a few seconds** (around 60 Last.fm calls for a 17-artist profile); results are cached for a day after that.
- **The Last.fm API key ships with the extension.** Any client-side app exposes its keys to users who inspect it. The key is read-only and rate-limited by Last.fm.

---

## Roadmap

- **Now:** the Chrome Web Store release.
- **v1.1:** Spotify IDs as a third matching layer. A first experiment (28 cross-script pairs) gave **0 wrong merges and 25/28 correct**, including Korean, Japanese, Chinese, Thai, Hebrew and one-word names; the misses came from Spotify's search on short names (`IU`, `AKMU`), not from the IDs. The same IDs would let each result open its exact Spotify artist page (today it opens a Spotify search). Also: recommendations by mood, genre and vibe.
- **Later:** a Spotify data-export upload (no 5-user cap, real play counts), a Last.fm username source.

---

## References

- Ò. Celma, P. Cano. *From hits to niches? or how popular artists can bias music recommendation and discovery.* 2nd Netflix-KDD Workshop, 2008.
- M. Schedl, D. Hauger, K. Farrahi, M. Tkalčič. *On the Influence of User Characteristics on Music Recommendation Algorithms.* ECIR 2015.
- M. Schedl, H. Zamani, C.-W. Chen, Y. Deldjoo, M. Elahi. *Current Challenges and Visions in Music Recommender Systems Research.* International Journal of Multimedia Information Retrieval, 2018.

---

## Credits

Built by Omar as a learning project.

The data sources, the Last.fm API wrapper, name normalization, similarity fetching, the cache, the ranking engine and the data-science decisions are my own work. With [Claude](https://claude.ai) being a mentor, and had non-related data science tasks relegated to it. It designed the front-end, pixel art. Wrote the exhaustive tests, and helped with PKCE authentication to speed up development.

Recommendations powered by [Last.fm](https://www.last.fm/api).

## License

See [`LICENSE`](LICENSE).
