# Name matching experiment

Run: 2026-11-19T03:27:36.708Z · set "world" · 106 tags · 100 artists per tag · 15 similar each

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
| Khmer / Lao / Burmese | 342 | 1753 | 14.4% | **59.3** | 98 | 97 | 0 | 0 | 0 | – |
| Ethiopian / Somali | 191 | 1232 | 9.0% | **46.3** | 57 | 57 | 0 | 0 | 0 | – |
| Kazakh / Uzbek / Kyrgyz | 300 | 2295 | 18.1% | **34.4** | 79 | 63 | 0 | 0 | 0 | – |
| Bulgarian / Macedonian | 300 | 2647 | 12.8% | **27.6** | 70 | 54 | 0 | 0 | 0 | – |
| Mongolian / Tibetan | 200 | 1647 | 8.0% | **17.6** | 29 | 24 | 0 | 0 | 0 | – |
| Azerbaijani | 100 | 1001 | 5.9% | **16.0** | 16 | 14 | 0 | 0 | 0 | – |
| Urdu / Pakistani | 300 | 2045 | 1.5% | **12.7** | 26 | 26 | 0 | 0 | 0 | – |
| Yiddish / Ladino | 278 | 1967 | 2.9% | **11.2** | 21 | 19 | 0 | 0 | 0 | – |
| Serbian / Croatian / Bosnian | 390 | 3571 | 3.2% | **10.4** | 37 | 33 | 0 | 0 | 0 | – |
| Amazigh / Berber | 250 | 2131 | 0.8% | **6.1** | 13 | 13 | 0 | 0 | 0 | – |
| Marathi / Gujarati / Nepali | 145 | 683 | 2.3% | **4.4** | 3 | 3 | 0 | 0 | 0 | – |
| West African | 587 | 5535 | 0.3% | **2.9** | 16 | 16 | 0 | 0 | 0 | – |
| Indonesian / Malay | 300 | 2470 | 1.3% | **2.4** | 6 | 4 | 0 | 0 | 0 | – |
| Swahili / East African | 295 | 2394 | 0.3% | **1.3** | 3 | 3 | 0 | 0 | 0 | – |
| Polish | 200 | 1783 | 0.3% | **1.1** | 2 | 2 | 0 | 0 | 0 | – |
| Hungarian | 100 | 967 | 0.1% | **1.0** | 1 | 1 | 0 | 0 | 0 | – |
| Pacific / Indigenous | 226 | 2005 | 0.7% | **1.0** | 2 | 2 | 0 | 0 | 0 | – |
| Tamil / Telugu / Malayalam | 418 | 3136 | 0.1% | **1.0** | 3 | 2 | 0 | 0 | 0 | – |
| Sinhala | 174 | 1109 | 0.2% | **0.9** | 1 | 1 | 0 | 0 | 0 | – |
| Southern African | 324 | 2540 | 0.2% | **0.8** | 2 | 1 | 0 | 0 | 0 | – |
| Baltic | 300 | 2600 | 0.5% | **0.8** | 2 | 0 | 0 | 0 | 0 | – |
| Albanian | 200 | 1608 | 0.3% | **0.6** | 1 | 0 | 0 | 0 | 0 | – |
| Central African | 246 | 1995 | 0.1% | **0.5** | 1 | 1 | 0 | 0 | 0 | – |
| Italian | 300 | 2681 | 0.1% | **0.4** | 1 | 1 | 0 | 0 | 0 | – |
| Romanian | 200 | 1359 | 0.3% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Czech / Slovak | 200 | 1632 | 0.2% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Finnish | 200 | 1844 | 0.0% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Swedish | 100 | 1169 | 0.3% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Norwegian | 100 | 1136 | 0.3% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Danish | 100 | 983 | 0.4% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Icelandic | 100 | 1038 | 0.3% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| German | 300 | 2456 | 0.0% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Dutch / Flemish | 200 | 1500 | 0.0% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Celtic | 300 | 3470 | 0.1% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Basque / Catalan / Galician | 300 | 2518 | 0.2% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Kurdish | 100 | 641 | 0.2% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Bengali | 200 | 1506 | 1.0% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Filipino | 244 | 1840 | 0.1% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Malagasy | 100 | 507 | 0.0% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |
| Haitian / Caribbean | 380 | 2769 | 0.4% | **0.0** | 0 | 0 | 0 | 0 | 0 | – |

## Artist metadata by language group (most popular first)

> From `artist.getInfo` and `artist.getTopTags` for every seed. Full data in `artists.jsonl` (everything)
> and `artists.csv` (spreadsheet). *Plays / listener* hints at how devoted the audience is.
> Tag counts are relative (top tag = 100), like `match`.

| Group | Artists | With info | With tags | With bio | Median listeners | Median plays / listener | Median tags | Most common tags |
|---|---|---|---|---|---|---|---|---|
| Swedish | 100 | 99.0% | 99.0% | 98.0% | 288.8K | 24.0 | 10 | swedish, pop, female vocalists, indie, rock |
| Norwegian | 100 | 100.0% | 100.0% | 100.0% | 198.7K | 20.3 | 10 | norwegian, pop, rock, female vocalists, electronic |
| Celtic | 300 | 100.0% | 100.0% | 98.3% | 123K | 13.4 | 10 | indie, irish, folk, scottish, rock |
| Danish | 100 | 100.0% | 100.0% | 100.0% | 81.1K | 16.5 | 10 | danish, pop, rock, indie, electronic |
| German | 290 | 100.0% | 99.7% | 92.4% | 76.9K | 18.5 | 10 | german, rap, deutschrap, schlager, deutsch |
| Polish | 196 | 100.0% | 100.0% | 71.9% | 67.8K | 36.1 | 10 | polish, rap, hip-hop, rock, polish rap |
| Icelandic | 100 | 100.0% | 100.0% | 100.0% | 66.7K | 13.0 | 10 | icelandic, indie, electronic, iceland, ambient |
| Italian | 250 | 99.6% | 99.6% | 76.0% | 53.3K | 12.1 | 10 | italian, pop, italian pop, singer-songwriter, cantautori |
| Dutch / Flemish | 167 | 100.0% | 100.0% | 99.4% | 52.3K | 14.8 | 10 | dutch, nederlandstalig, pop, rock, singer-songwriter |
| Finnish | 166 | 100.0% | 100.0% | 95.2% | 47.8K | 27.7 | 10 | finnish, pop, suomi, rock, finland |
| Filipino | 183 | 100.0% | 100.0% | 76.0% | 39.8K | 14.2 | 10 | opm, filipino, philippines, pop, pinoy |
| Hungarian | 100 | 100.0% | 100.0% | 99.0% | 15.6K | 17.7 | 10 | hungarian, rock, alternative, magyar, hungary |
| Czech / Slovak | 199 | 100.0% | 100.0% | 99.5% | 12.6K | 29.6 | 10 | czech, slovak, rock, pop, alternative |
| Romanian | 196 | 100.0% | 100.0% | 64.8% | 10K | 10.9 | 10 | romanian, manele, romania, pop, dance |
| Baltic | 299 | 100.0% | 100.0% | 96.3% | 9.6K | 20.2 | 10 | lithuanian, latvian, estonian, rock, pop |
| Indonesian / Malay | 300 | 100.0% | 100.0% | 78.3% | 8.6K | 14.7 | 10 | indonesian, indonesia, dangdut, pop, malaysian |
| Serbian / Croatian / Bosnian | 382 | 100.0% | 100.0% | 81.9% | 7.2K | 16.7 | 10 | serbian, pop, croatian, bosnian, rock |
| Haitian / Caribbean | 345 | 100.0% | 100.0% | 59.1% | 6.8K | 7.2 | 10 | zouk, dancehall, haitian, reggae, haiti |
| Southern African | 302 | 100.0% | 100.0% | 71.2% | 5.4K | 9.7 | 7 | south african, south africa, afrikaans, amapiano, african |
| Pacific / Indigenous | 219 | 100.0% | 100.0% | 59.4% | 4.4K | 7.6 | 7 | hawaiian, folk, hawaii, maori, new zealand |
| West African | 536 | 100.0% | 100.0% | 54.5% | 4K | 6.4 | 8 | african, nigeria, world, afrobeats, ghana |
| Bulgarian / Macedonian | 276 | 100.0% | 100.0% | 82.2% | 3.8K | 15.6 | 10 | bulgarian, macedonian, pop, chalga, bulgaria |
| Basque / Catalan / Galician | 300 | 100.0% | 100.0% | 56.3% | 3.6K | 13.8 | 10 | catalan, basque, folk, galician, galiza |
| Yiddish / Ladino | 251 | 100.0% | 100.0% | 65.7% | 2.5K | 7.9 | 10 | klezmer, jewish, yiddish, folk, sephardic |
| Urdu / Pakistani | 248 | 100.0% | 99.6% | 58.9% | 1.9K | 7.2 | 5 | pakistani, pakistan, qawwali, urdu, world |
| Kurdish | 100 | 100.0% | 100.0% | 60.0% | 1.8K | 9.4 | 10 | kurdish, kurdistan, folk, world, kurdish folk |
| Central African | 220 | 100.0% | 100.0% | 46.4% | 1.6K | 6.1 | 6 | congo, soukous, congolese, african, dr congo |
| Albanian | 187 | 100.0% | 100.0% | 41.7% | 1.5K | 9.4 | 7 | albanian, albania, shqip, pop, albanisch |
| Tamil / Telugu / Malayalam | 320 | 100.0% | 100.0% | 47.5% | 1.5K | 8.2 | 4 | indian, tamil, india, kollywood, telugu |
| Ethiopian / Somali | 187 | 100.0% | 100.0% | 44.9% | 1.5K | 6.4 | 5 | ethiopian, ethiopia, somali, jazz, world |
| Azerbaijani | 100 | 100.0% | 100.0% | 41.0% | 1.1K | 9.0 | 6 | azerbaijani, azerbaijan, pop, azeri, eurovision |
| Marathi / Gujarati / Nepali | 143 | 100.0% | 100.0% | 56.6% | 1.1K | 9.2 | 4 | nepali, nepal, indian, marathi, india |
| Mongolian / Tibetan | 199 | 100.0% | 100.0% | 62.3% | 892 | 9.2 | 9 | tibetan, mongolian, mongolia, tibet, folk |
| Bengali | 173 | 100.0% | 100.0% | 56.6% | 828 | 8.8 | 4 | bengali, bangla, bangladesh, india, indian |
| Kazakh / Uzbek / Kyrgyz | 299 | 100.0% | 100.0% | 40.8% | 494 | 10.4 | 7 | kyrgyz, kazakh, uzbek, kyrgyzstan, pop |
| Swahili / East African | 245 | 100.0% | 100.0% | 37.1% | 418 | 6.3 | 4 | kenyan, bongo flava, tanzania, kenya, swahili |
| Khmer / Lao / Burmese | 286 | 99.7% | 99.7% | 30.4% | 352 | 8.3 | 4 | cambodian, khmer, burmese, myanmar, cambodia |
| Sinhala | 132 | 100.0% | 100.0% | 39.4% | 304 | 9.9 | 4 | sri lankan, sri lanka, sinhala, sinhalese, sinhala pop |
| Malagasy | 99 | 100.0% | 100.0% | 24.2% | 215 | 6.1 | 4 | malagasy, madagascar, malgache, female vocalists, salegy |
| Amazigh / Berber | 208 | 100.0% | 100.0% | 26.9% | 143.5 | 5.9 | 5 | amazigh, kabyle, north africa, algeria, algerian |

## By tag

| Tag | Group | Main scripts | Seeds | Not found (6) | Autocorrected | Seed in own list | Leaks (MBID, lower bound) | Cross-script | Suspects (≥ 0.8) | …of which no MBID | MBID coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|
| albanian | Albanian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.4% | 1 | 0 (0.0%) | seeds 66.0%, similar 56.5% |
| shqip | Albanian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.1% | 0 | 0 (–) | seeds 28.0%, similar 49.7% |
| serbian | Serbian / Croatian / Bosnian | Latin 99, Other 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.9% | 0 | 0 (–) | seeds 75.0%, similar 58.8% |
| croatian | Serbian / Croatian / Bosnian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 2.2% | 3 | 0 (0.0%) | seeds 84.0%, similar 74.0% |
| bosnian | Serbian / Croatian / Bosnian | Latin 99, Other 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.1% | 1 | 0 (0.0%) | seeds 72.0%, similar 64.4% |
| yugoslav | Serbian / Croatian / Bosnian | Latin 35 | 35 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.5% | 2 | 2 (100.0%) | seeds 40.0%, similar 45.8% |
| turbo folk | Serbian / Croatian / Bosnian | Latin 43, Cyrillic 12 | 55 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 9.6% | 31 | 31 (100.0%) | seeds 32.7%, similar 58.5% |
| bulgarian | Bulgarian / Macedonian | Latin 71, Cyrillic 29 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 14.7% | 24 | 17 (70.8%) | seeds 68.0%, similar 63.2% |
| macedonian | Bulgarian / Macedonian | Latin 91, Cyrillic 9 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 9.3% | 14 | 13 (92.9%) | seeds 51.0%, similar 50.9% |
| chalga | Bulgarian / Macedonian | Latin 57, Cyrillic 43 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 15.0% | 35 | 27 (77.1%) | seeds 57.0%, similar 78.4% |
| romanian | Romanian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 81.0%, similar 70.5% |
| manele | Romanian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.8% | 0 | 0 (–) | seeds 24.0%, similar 36.5% |
| hungarian | Hungarian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.1% | 1 | 1 (100.0%) | seeds 93.0%, similar 81.8% |
| polish | Polish | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.4% | 1 | 1 (100.0%) | seeds 94.0%, similar 88.8% |
| polish rap | Polish | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.3% | 1 | 1 (100.0%) | seeds 62.0%, similar 66.4% |
| czech | Czech / Slovak | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.3% | 0 | 0 (–) | seeds 91.0%, similar 83.6% |
| slovak | Czech / Slovak | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 86.0%, similar 73.4% |
| lithuanian | Baltic | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.4% | 1 | 0 (0.0%) | seeds 85.0%, similar 71.8% |
| latvian | Baltic | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.9% | 1 | 0 (0.0%) | seeds 80.0%, similar 73.3% |
| estonian | Baltic | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 0 | 0 (–) | seeds 89.0%, similar 82.2% |
| finnish | Finnish | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 99.0%, similar 91.5% |
| suomi | Finnish | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 95.0%, similar 86.3% |
| swedish | Swedish | Latin 100 | 100 | 1 (1.0%) | 0 | 0 | 0 (0.0%) | 0.3% | 0 | 0 (–) | seeds 97.0%, similar 91.6% |
| norwegian | Norwegian | Latin 99, Other 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.3% | 0 | 0 (–) | seeds 96.0%, similar 90.2% |
| danish | Danish | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.4% | 0 | 0 (–) | seeds 92.0%, similar 89.8% |
| icelandic | Icelandic | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.3% | 0 | 0 (–) | seeds 94.0%, similar 88.2% |
| german | German | Latin 100 | 100 | 0 (0.0%) | 2 | 0 | 0 (0.0%) | 0.1% | 0 | 0 (–) | seeds 96.0%, similar 89.4% |
| deutschrap | German | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 94.0%, similar 72.2% |
| schlager | German | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 95.0%, similar 94.6% |
| dutch | Dutch / Flemish | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 91.0%, similar 87.9% |
| nederlandstalig | Dutch / Flemish | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 93.0%, similar 88.0% |
| italian | Italian | Latin 99, Other 1 | 100 | 1 (1.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 92.0%, similar 88.3% |
| italian pop | Italian | Latin 99, Other 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.4% | 1 | 1 (100.0%) | seeds 77.0%, similar 75.6% |
| cantautori | Italian | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 87.0%, similar 82.2% |
| irish | Celtic | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.1% | 0 | 0 (–) | seeds 94.0%, similar 89.7% |
| welsh | Celtic | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 93.0%, similar 89.8% |
| scottish | Celtic | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 0 | 0 (–) | seeds 94.0%, similar 91.7% |
| basque | Basque / Catalan / Galician | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.1% | 0 | 0 (–) | seeds 74.0%, similar 78.6% |
| catalan | Basque / Catalan / Galician | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.5% | 0 | 0 (–) | seeds 86.0%, similar 78.4% |
| galician | Basque / Catalan / Galician | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.1% | 0 | 0 (–) | seeds 46.0%, similar 69.1% |
| yiddish | Yiddish / Ladino | Latin 98, Hebrew 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 2.8% | 11 | 9 (81.8%) | seeds 59.0%, similar 56.6% |
| klezmer | Yiddish / Ladino | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.8% | 2 | 2 (100.0%) | seeds 77.0%, similar 68.2% |
| ladino | Yiddish / Ladino | Latin 77, Hebrew 1 | 78 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 5.1% | 9 | 9 (100.0%) | seeds 44.9%, similar 54.0% |
| kazakh | Kazakh / Uzbek / Kyrgyz | Latin 74, Cyrillic 26 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 23.1% | 37 | 22 (59.5%) | seeds 50.0%, similar 45.0% |
| uzbek | Kazakh / Uzbek / Kyrgyz | Latin 92, Cyrillic 8 | 100 | 0 (0.0%) | 1 | 0 | 0 (0.0%) | 4.2% | 2 | 1 (50.0%) | seeds 32.0%, similar 43.0% |
| kyrgyz | Kazakh / Uzbek / Kyrgyz | Cyrillic 66, Latin 34 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 22.2% | 40 | 40 (100.0%) | seeds 21.0%, similar 27.0% |
| azerbaijani | Azerbaijani | Latin 97, Cyrillic 3 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 5.9% | 16 | 14 (87.5%) | seeds 42.0%, similar 51.1% |
| kurdish | Kurdish | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 0 | 0 (–) | seeds 46.0%, similar 44.1% |
| pakistani | Urdu / Pakistani | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 85.0%, similar 75.0% |
| urdu | Urdu / Pakistani | Latin 97, Arabic 3 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 3.1% | 21 | 21 (100.0%) | seeds 61.0%, similar 68.6% |
| qawwali | Urdu / Pakistani | Latin 94, Arabic 6 | 100 | 0 (0.0%) | 1 | 0 | 0 (0.0%) | 1.0% | 5 | 5 (100.0%) | seeds 25.0%, similar 63.9% |
| bengali | Bengali | Latin 99, Bengali 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.4% | 0 | 0 (–) | seeds 53.0%, similar 58.5% |
| bangla | Bengali | Latin 99, Bengali 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.7% | 0 | 0 (–) | seeds 46.0%, similar 64.5% |
| tamil | Tamil / Telugu / Malayalam | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 63.0%, similar 63.1% |
| telugu | Tamil / Telugu / Malayalam | Latin 89 | 89 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.4% | 3 | 2 (66.7%) | seeds 51.7%, similar 58.1% |
| malayalam | Tamil / Telugu / Malayalam | Latin 87, Other 1 | 88 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 50.0%, similar 66.2% |
| kollywood | Tamil / Telugu / Malayalam | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 43.0%, similar 50.2% |
| tollywood | Tamil / Telugu / Malayalam | Latin 41 | 41 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 58.5%, similar 62.3% |
| marathi | Marathi / Gujarati / Nepali | Latin 34 | 34 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 58.8%, similar 78.7% |
| gujarati | Marathi / Gujarati / Nepali | Latin 10, Gujarati 1 | 11 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 10.1% | 3 | 3 (100.0%) | seeds 54.5%, similar 48.4% |
| nepali | Marathi / Gujarati / Nepali | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 34.0%, similar 27.1% |
| sinhala | Sinhala | Latin 74 | 74 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 1 | 1 (100.0%) | seeds 20.3%, similar 42.2% |
| sri lankan | Sinhala | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 0 | 0 (–) | seeds 25.0%, similar 42.1% |
| indonesian | Indonesian / Malay | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.3% | 0 | 0 (–) | seeds 85.0%, similar 74.0% |
| malaysian | Indonesian / Malay | Latin 93, Han 7 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.8% | 5 | 3 (60.0%) | seeds 75.0%, similar 62.4% |
| dangdut | Indonesian / Malay | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.5% | 1 | 1 (100.0%) | seeds 34.0%, similar 37.5% |
| filipino | Filipino | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 0 | 0 (–) | seeds 81.0%, similar 78.5% |
| opm | Filipino | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 87.0%, similar 83.3% |
| tagalog | Filipino | Latin 44 | 44 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 63.6%, similar 78.1% |
| cambodian | Khmer / Lao / Burmese | Latin 79, Khmer 21 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 19.0% | 59 | 59 (100.0%) | seeds 29.0%, similar 30.5% |
| khmer | Khmer / Lao / Burmese | Latin 76, Khmer 24 | 100 | 1 (1.0%) | 0 | 0 | 0 (0.0%) | 15.9% | 21 | 21 (100.0%) | seeds 22.0%, similar 31.1% |
| lao | Khmer / Lao / Burmese | Latin 40, Thai 1 | 42 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 10.6% | 5 | 4 (80.0%) | seeds 21.4%, similar 42.1% |
| burmese | Khmer / Lao / Burmese | Latin 90, Myanmar 10 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 10.3% | 19 | 19 (100.0%) | seeds 34.0%, similar 44.2% |
| mongolian | Mongolian / Tibetan | Latin 89, Cyrillic 6 | 100 | 0 (0.0%) | 1 | 0 | 0 (0.0%) | 10.0% | 12 | 8 (66.7%) | seeds 52.0%, similar 40.5% |
| tibetan | Mongolian / Tibetan | Latin 94, Han 6 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 5.3% | 17 | 16 (94.1%) | seeds 28.0%, similar 32.4% |
| swahili | Swahili / East African | Latin 58 | 58 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 1 | 1 (100.0%) | seeds 29.3%, similar 51.1% |
| bongo flava | Swahili / East African | Latin 95 | 95 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.0% | 2 | 2 (100.0%) | seeds 28.4%, similar 40.8% |
| kenyan | Swahili / East African | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 47.0%, similar 53.2% |
| tanzanian | Swahili / East African | Latin 42 | 42 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 33.3%, similar 48.2% |
| ethiopian | Ethiopian / Somali | Latin 95, Ethiopic 5 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 5.0% | 2 | 2 (100.0%) | seeds 47.0%, similar 45.6% |
| amharic | Ethiopian / Somali | Ethiopic 6, Latin 5 | 11 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 47.5% | 53 | 53 (100.0%) | seeds 9.1%, similar 27.2% |
| somali | Ethiopian / Somali | Latin 80 | 80 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.7% | 2 | 2 (100.0%) | seeds 26.3%, similar 39.8% |
| afrobeats | West African | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 70.0%, similar 64.7% |
| nigerian | West African | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 76.0%, similar 68.6% |
| ghanaian | West African | Latin 99, Greek 1 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.4% | 16 | 16 (100.0%) | seeds 46.0%, similar 63.2% |
| highlife | West African | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 59.0%, similar 63.5% |
| senegalese | West African | Latin 93 | 93 | 0 (0.0%) | 0 | 1 | 0 (0.0%) | 0.1% | 0 | 0 (–) | seeds 49.5%, similar 56.5% |
| malian | West African | Latin 94 | 94 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 47.9%, similar 62.8% |
| congolese | Central African | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 47.0%, similar 53.2% |
| soukous | Central African | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 63.0%, similar 57.0% |
| cameroonian | Central African | Latin 46 | 46 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.5% | 1 | 1 (100.0%) | seeds 45.7%, similar 60.6% |
| south african | Southern African | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.1% | 0 | 0 (–) | seeds 90.0%, similar 82.5% |
| afrikaans | Southern African | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.4% | 0 | 0 (–) | seeds 77.0%, similar 62.3% |
| amapiano | Southern African | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 66.0%, similar 55.7% |
| zulu | Southern African | Latin 24 | 24 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.7% | 2 | 1 (50.0%) | seeds 58.3%, similar 65.1% |
| malagasy | Malagasy | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 46.0%, similar 62.9% |
| berber | Amazigh / Berber | Latin 58, Arabic 1 | 59 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.8% | 12 | 12 (100.0%) | seeds 35.6%, similar 50.1% |
| amazigh | Amazigh / Berber | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.2% | 0 | 0 (–) | seeds 39.0%, similar 53.6% |
| kabyle | Amazigh / Berber | Latin 90, Arabic 1 | 91 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.6% | 1 | 1 (100.0%) | seeds 36.3%, similar 46.2% |
| haitian | Haitian / Caribbean | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.4% | 0 | 0 (–) | seeds 43.0%, similar 59.3% |
| kompa | Haitian / Caribbean | Latin 80 | 80 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 41.3%, similar 70.4% |
| zouk | Haitian / Caribbean | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.0% | 0 | 0 (–) | seeds 80.0%, similar 77.7% |
| dancehall | Haitian / Caribbean | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.0% | 0 | 0 (–) | seeds 95.0%, similar 88.8% |
| hawaiian | Pacific / Indigenous | Latin 100 | 100 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 1.1% | 0 | 0 (–) | seeds 80.0%, similar 76.8% |
| maori | Pacific / Indigenous | Latin 61 | 61 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.6% | 1 | 1 (100.0%) | seeds 44.3%, similar 68.3% |
| polynesian | Pacific / Indigenous | Latin 65 | 65 | 0 (0.0%) | 0 | 0 | 0 (0.0%) | 0.5% | 1 | 1 (100.0%) | seeds 38.5%, similar 45.2% |

## Totals

**Querying**
- Seeds queried: 9590
- Not found (code 6): 3 (0.0%)
- Other errors after retries: 0
- Autocorrected to another name: 5

**Duplicates the MBID check can prove (lower bound)**
- Seed listed as its own similar artist: 1 (0 under a different name, see self-duplicates.csv)
- Known-artist leaks: 0 (0.0% of 78163 new candidates)
- Same MBID under several names: 0 (see mbid-aliases.csv)

**What the MBID check cannot see**
- MBID coverage: seeds 62.9%, candidates 66.3%
- Candidates in another script than their seed: 1713 (2.2%), of which 1329 (77.6%) have no MBID on one side
- Cross-script suspects with match ≥ 0.8: 490 unique pairs; MBID check: 0 same, 53 different, **437 unknown**

**Your hand review (verdict column in suspects.csv)**
- Review-first sample: 138 pairs (10 per language group), labeled: 0
- No verdicts yet. Fill the verdict column of the review_first rows with: same / different / related / unsure, then run again.

Network calls this run: 26225
