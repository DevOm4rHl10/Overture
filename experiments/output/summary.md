# Name matching experiment

Run: 2026-11-18T18:47:08.994Z · 51 tags · 100 artists per tag · 15 similar each

> **How to read this.** "Leaks (MBID)" only counts duplicates that MusicBrainz IDs can prove, so it is a
> *lower bound*. When an artist has no MBID, a duplicate is invisible to it. The "Suspects" columns show how
> many high-match, cross-script pairs exist and how many of them the MBID check could not verify at all.
> The true duplicate rate comes from the verdicts you write in suspects.csv.

## By language group (highest suspect rate first)

> *Suspects / 1,000* = cross-script, high-match pairs per 1,000 recommendations: how often a user of that
> language would see a **possible** duplicate. Not all suspects are duplicates (scene peers like Toni Qattan
> also show up), so label the `review_first` rows in suspects.csv: *Same* and *Est. duplicates / 1,000* then
> turn the suspect rate into an estimated real error rate.

| Group | Seeds | Recommendations | Cross-script | Suspects / 1,000 | Unique pairs | …no MBID | Labeled | Same | Different | Est. duplicates / 1,000 |
|---|---|---|---|---|---|---|---|---|---|---|
| Greek | 200 | 1887 | 17.8% | **63.6** | 115 | 110 | 0 | 0 | 0 | – |
| Hebrew | 200 | 1516 | 18.5% | **50.8** | 53 | 52 | 0 | 0 | 0 | – |
| Japanese | 400 | 4287 | 31.9% | **47.1** | 153 | 63 | 0 | 0 | 0 | – |
| Russian / Cyrillic | 400 | 3294 | 27.8% | **42.2** | 132 | 59 | 0 | 0 | 0 | – |
| Chinese | 400 | 3418 | 22.6% | **32.2** | 104 | 81 | 0 | 0 | 0 | – |
| Arabic | 400 | 2588 | 7.7% | **18.5** | 48 | 47 | 0 | 0 | 0 | – |
| Thai | 200 | 1815 | 10.5% | **13.8** | 23 | 18 | 0 | 0 | 0 | – |
| Korean | 200 | 1826 | 10.0% | **13.7** | 16 | 13 | 0 | 0 | 0 | – |
| Armenian / Georgian | 200 | 2010 | 9.6% | **9.5** | 19 | 19 | 0 | 0 | 0 | – |
| French | 300 | 2833 | 0.5% | **1.4** | 4 | 3 | 0 | 0 | 0 | – |
| English | 600 | 6908 | 0.2% | **0.3** | 2 | 1 | 0 | 0 | 0 | – |
| Persian | 200 | 1467 | 0.0% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Turkish | 200 | 885 | 0.0% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Indian | 300 | 1649 | 0.1% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Spanish / Latin | 400 | 3136 | 0.1% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Portuguese | 300 | 2198 | 0.1% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Vietnamese | 200 | 1550 | 0.0% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |

## By tag

| Tag | Group | Main scripts | Seeds | Not found (6) | Autocorrected | Seed in own list | Leaks (MBID, lower bound) | Cross-script | Suspects (≥ 0.8) | …of which no MBID | MBID coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pop | English | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.8% | 0 | 0 (–) | seeds 96.0%, similar 87.8% |
| rock | English | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 97.0%, similar 92.8% |
| hip-hop | English | Latin 99, Other 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.1% | 0 | 0 (–) | seeds 94.0%, similar 86.7% |
| indie | English | Latin 100 | 100 | 0 (0.0%) | 1 | 0 | 0 (0.0%) | 0.1% | 0 | 0 (–) | seeds 97.0%, similar 93.0% |
| british | English | Latin 100 | 100 | 0 (0.0%) | 1 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 94.0%, similar 90.9% |
| american | English | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.6% | 2 | 1 (50.0%) | seeds 94.0%, similar 91.5% |
| russian | Russian / Cyrillic | Latin 55, Cyrillic 45 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 26.7% | 46 | 19 (41.3%) | seeds 75.0%, similar 77.9% |
| ukrainian | Russian / Cyrillic | Latin 61, Cyrillic 38 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 23.8% | 25 | 11 (44.0%) | seeds 72.0%, similar 69.4% |
| russian pop | Russian / Cyrillic | Cyrillic 77, Latin 23 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 24.7% | 25 | 8 (32.0%) | seeds 79.0%, similar 74.3% |
| russian rap | Russian / Cyrillic | Cyrillic 53, Latin 46 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 37.0% | 43 | 23 (53.5%) | seeds 70.0%, similar 60.4% |
| chinese | Chinese | Han 70, Latin 30 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 16.5% | 13 | 10 (76.9%) | seeds 84.0%, similar 71.4% |
| mandopop | Chinese | Latin 56, Han 44 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 28.0% | 57 | 53 (93.0%) | seeds 42.0%, similar 49.5% |
| cantopop | Chinese | Latin 53, Han 47 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 24.4% | 24 | 12 (50.0%) | seeds 58.0%, similar 69.7% |
| c-pop | Chinese | Han 72, Latin 27 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 17.9% | 16 | 9 (56.3%) | seeds 87.0%, similar 72.1% |
| japanese | Japanese | Latin 75, Han 16 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 28.5% | 54 | 24 (44.4%) | seeds 80.0%, similar 70.9% |
| j-pop | Japanese | Latin 67, Han 16 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 33.3% | 78 | 25 (32.1%) | seeds 78.0%, similar 75.5% |
| j-rock | Japanese | Latin 87, Japanese 9 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 25.1% | 27 | 13 (48.1%) | seeds 84.0%, similar 77.0% |
| anime | Japanese | Latin 59, Han 25 | 100 | 0 (0.0%) | 1 | 1 | 0 (0.0%) | 40.0% | 43 | 18 (41.9%) | seeds 79.0%, similar 77.9% |
| korean | Korean | Latin 89, Hangul 10 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 12.5% | 18 | 13 (72.2%) | seeds 83.0%, similar 68.2% |
| k-pop | Korean | Latin 97, Hangul 3 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 7.4% | 7 | 7 (100.0%) | seeds 86.0%, similar 66.4% |
| arabic | Arabic | Latin 98, Arabic 2 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.8% | 3 | 3 (100.0%) | seeds 49.0%, similar 63.2% |
| khaleeji | Arabic | Arabic 71, Latin 29 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 24.8% | 45 | 44 (97.8%) | seeds 17.0%, similar 32.8% |
| rai | Arabic | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.7% | 0 | 0 (–) | seeds 62.0%, similar 62.8% |
| egyptian | Arabic | Latin 91, Arabic 9 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.0% | 0 | 0 (–) | seeds 56.0%, similar 55.8% |
| greek | Greek | Latin 74, Greek 26 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 15.3% | 28 | 23 (82.1%) | seeds 50.0%, similar 55.1% |
| laiko | Greek | Latin 73, Greek 27 | 100 | 0 (0.0%) | 1 | 0 | 0 (0.0%) | 19.7% | 92 | 92 (100.0%) | seeds 19.0%, similar 33.4% |
| israeli | Hebrew | Hebrew 71, Latin 29 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 20.7% | 36 | 35 (97.2%) | seeds 82.0%, similar 55.7% |
| hebrew | Hebrew | Hebrew 68, Latin 32 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 16.8% | 41 | 41 (100.0%) | seeds 76.0%, similar 57.4% |
| persian | Persian | Latin 99, Other 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 78.0%, similar 67.8% |
| iranian | Persian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 72.0%, similar 71.5% |
| turkish | Turkish | Latin 100 | 100 | 0 (0.0%) | 5 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 96.0%, similar 91.5% |
| turkish pop | Turkish | Latin 100 | 100 | 0 (0.0%) | 5 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 99.0%, similar 86.3% |
| bollywood | Indian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 0 | 0 (–) | seeds 87.0%, similar 60.6% |
| hindi | Indian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 92.0%, similar 70.5% |
| punjabi | Indian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 89.0%, similar 83.2% |
| thai | Thai | Latin 98, Other 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 9.8% | 15 | 11 (73.3%) | seeds 65.0%, similar 43.5% |
| t-pop | Thai | Latin 90, Thai 9 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 11.0% | 10 | 9 (90.0%) | seeds 29.0%, similar 31.3% |
| latin | Spanish / Latin | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 92.0%, similar 80.3% |
| reggaeton | Spanish / Latin | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 0 | 0 (–) | seeds 81.0%, similar 69.0% |
| spanish | Spanish / Latin | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 93.0%, similar 84.1% |
| latin pop | Spanish / Latin | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.3% | 0 | 0 (–) | seeds 91.0%, similar 87.0% |
| brazilian | Portuguese | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 90.0%, similar 86.1% |
| mpb | Portuguese | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 91.0%, similar 86.1% |
| portuguese | Portuguese | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.3% | 0 | 0 (–) | seeds 89.0%, similar 76.5% |
| french | French | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 1 | 0 (0.0%) | seeds 92.0%, similar 92.2% |
| chanson | French | Latin 82, Cyrillic 18 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.3% | 3 | 3 (100.0%) | seeds 92.0%, similar 91.5% |
| french rap | French | Latin 98, Other 2 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 88.0%, similar 80.0% |
| armenian | Armenian / Georgian | Latin 97, Armenian 3 | 100 | 0 (0.0%) | 1 | 0 | 0 (0.0%) | 5.7% | 8 | 8 (100.0%) | seeds 63.0%, similar 52.4% |
| georgian | Armenian / Georgian | Latin 88, Georgian 7 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 13.3% | 11 | 11 (100.0%) | seeds 55.0%, similar 50.3% |
| vietnamese | Vietnamese | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 81.0%, similar 73.3% |
| v-pop | Vietnamese | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 72.0%, similar 60.1% |

## Totals

**Querying**
- Seeds queried: 5100
- Not found (code 6): 0 (0.0%)
- Other errors after retries: 0
- Autocorrected to another name: 15

**Duplicates the MBID check can prove (lower bound)**
- Seed listed as its own similar artist: 1 (0 under a different name, see self-duplicates.csv)
- Known-artist leaks: 0 (0.0% of 43267 new candidates)
- Same MBID under several names: 0 (see mbid-aliases.csv)

**What the MBID check cannot see**
- MBID coverage: seeds 76.8%, candidates 71.4%
- Candidates in another script than their seed: 4472 (10.3%), of which 2678 (59.9%) have no MBID on one side
- Cross-script suspects with match ≥ 0.8: 669 unique pairs; MBID check: 0 same, 203 different, **466 unknown**

**Your hand review (verdict column in suspects.csv)**
- Review-first sample: 96 pairs (10 per language group), labeled: 0
- No verdicts yet. Fill the verdict column of the review_first rows with: same / different / related / unsure, then run again.

Network calls this run: 3381
