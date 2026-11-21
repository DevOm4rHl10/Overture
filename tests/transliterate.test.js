// Tests for extension/shared/transliterate.js (Layer 2 of name matching)
// Run from the repo root: node --test
//
// Most pairs below come from real Last.fm data (experiments/output/artists.csv).
// Groups:
//   1. Same artist, two scripts       must match
//   2. False merges found on real data must NEVER match again (regressions)
//   3. Known misses                    current behavior, documented on purpose.
//                                      If a new folding rule fixes one, move it to group 1.
//   4. Out of scope                    same script, Latin↔Latin, unsupported scripts
//   5. Properties                      symmetry, Layer 1, robustness, types

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isSameArtist, looseKey, skeletonKey } from "../extension/shared/transliterate.js";

const same = (a, b) => assert.equal(isSameArtist(a, b), true, `expected "${a}" and "${b}" to be the same artist`);
const notSame = (a, b) => assert.equal(isSameArtist(a, b), false, `expected "${a}" and "${b}" NOT to be merged`);


// ─────────────────────────────────────────────────────────────
// 1. Same artist, two scripts
// ─────────────────────────────────────────────────────────────
describe("Same artist, two scripts", () =>
{
    const pairs = {
        "Russian": [
            ["Клава Кока", "Klava Koka"],
            ["Алла Пугачёва", "Alla Pugacheva"],          // ё → e
            ["Виктор Цой", "Viktor Tsoi"],                // ц → ts → c
            ["Михаил Круг", "Mikhail Krug"],              // х → kh → h
            ["Юлианна Караулова", "Yulianna Karaulova"],  // ю → yu, double letters
            ["Люся Чеботина", "Lusia Chebotina"],         // ю after a consonant: yu → u (real Spotify ↔ Last.fm pair)
            ["Люся Чеботина", "Lyusya Chebotina"],        // the full transliteration still matches
            ["Татьяна Куртукова", "Tatyana Kurtukova"],   // ь disappears
            ["Ирина Дубцова", "Irina Dubtsova"],
            ["Маша и медведи", "masha i medvedi"],
            ["масло черного тмина", "maslo chernogo tmina"],
            ["Каспийский Груз", "Kaspiyskiy Gruz"],       // й → y → i
            ["9 Грамм", "9 Gramm"],                       // digits kept
        ],
        "Ukrainian": [
            ["Жадан і собаки", "Zhadan i Sobaky"],        // і, y/i
            ["Цукор біла смерть", "Cukor Bila Smert'"],   // ц → c, apostrophe ignored
        ],
        "Serbian": [
            ["Ђорђе Балашевић", "Đorđe Balašević"],       // ђ ↔ đ, ћ ↔ ć
            ["Светлана Ражнатовић", "Svetlana Ražnatović"],
            ["Здравко Чолић", "Zdravko Čolić"],           // ч ↔ č
        ],
        "Bulgarian, Macedonian": [
            ["Лили Иванова", "Lili Ivanova"],
            ["Деси Слава", "Desi Slava"],
            ["Милко Калайджиев", "Milko Kalaydzhiev"],    // дж → dzh
            ["Тоше Проески", "Toše Proeski"],             // ш ↔ š
            ["Каролина Гочева", "Karolina Gočeva"],       // ч ↔ č
        ],
        "Kazakh, Kyrgyz, Uzbek": [
            ["Кайрат Нуртас", "Kairat Nurtas"],
            ["Мирбек Атабеков", "Mirbek Atabekov"],
            ["Муниса Ризаева", "Munisa Rizaeva"],
        ],
        "Greek": [
            ["Δημήτρης Μητροπάνος", "Dimitris Mitropanos"],
            ["Χάρις Αλεξίου", "Haris Alexiou"],           // χ → h, ξ → x
            ["Δέσποινα Βανδή", "Despina Vandi"],          // οι → i
            ["Στέλιος Καζαντζίδης", "Stelios Kazantzidis"],
            ["Βασίλης Παπακωνσταντίνου", "Vasilis Papakonstantinou"],
            ["Γιώργος Νταλάρας", "Giorgos Dalaras"],      // word-initial ντ → d
            ["Άννα Βίσση", "Anna Vissi"],                 // double letters
            ["Βίκυ Μοσχολιού", "Viky Moscholiou"],
            ["Φανή Δρακοπούλου", "Fani Drakopoulou"],
        ],
        "Armenian": [
            ["Լուսինե Զաքարյան", "Lusine Zakarian"],
        ],
        "Georgian": [
            ["ჰამლეტ გონაშვილი", "Hamlet Gonashvili"],
        ],
        "Arabic": [
            ["محمد عساف", "Mohammad Assaf"],
            ["عمرو دياب", "Amr Diab"],
            ["عبدالله طارق", "Abdullah Tariq"],           // final h, joined words
            ["عيسى المرزوق", "Essa Almarzoug"],           // ق → q / k / g
            ["عيسى المرزوق", "Issa Al Marzoug"],
            ["مطرف المطرف", "Motref AlMotreef"],
            ["ام كلثوم", "Oum Kalthoum"],                 // ث → th
            ["ماجدة الرومي", "Majida El Roumi"],          // ة, El
            ["عبد الحليم حافظ", "Abdel Halim Hafez"],
            ["وائل كفوري", "Wael Kfoury"],
            ["مشروع ليلى", "Mashrou' Leila"],             // ع, apostrophe
            ["حسين الجسمي", "Hussain Al Jassmi"],
            ["لينا شاماميان", "Lena Chamamyan"],
        ],
        "Urdu, Persian letters": [
            ["نصرت فتح علی خان", "Nusrat Fateh Ali Khan"], // Persian ی
            ["بلال خان", "Bilal Khan"],
        ],
    };

    for (const [language, list] of Object.entries(pairs))
    {
        test(language, () => { for (const [a, b] of list) same(a, b); });
    }

    test("works whichever side is written first", () =>
    {
        same("Klava Koka", "Клава Кока");
        same("Mohammad Assaf", "محمد عساف");
    });

    test("case, accents and extra spaces don't matter", () =>
    {
        same("  КЛАВА КОКА ", "klava koka");
        same("Στέλιος Καζαντζίδης", "Stélios Kazantzídis");
    });

    test("a one-word name on either side never matches", () =>
    {
        notSame("Klava", "Клава Кока");
        notSame("Klava Koka", "Клава");
    });
});


// ─────────────────────────────────────────────────────────────
// 2. False merges found on real data: must never come back
// ─────────────────────────────────────────────────────────────
describe("False merges found on real data", () =>
{
    test("short one-word names in two scripts are different artists", () =>
    {
        notSame("Nanna", "На-На");          // Nordic singer ≠ Russian boy band
        notSame("YUTA", "Юта");             // Japanese ≠ Russian singer
        notSame("Elkka", "Ёлка");           // UK producer ≠ Russian singer
        notSame("MERRY", "Мері");           // Japanese band ≠ Ukrainian band
        notSame("Pijika", "Пика");
        notSame("Lynda", "Линда");
        notSame("Asya", "Асия");
        notSame("Thalía", "ΘΑΛΕΙΑ");
    });

    test("one-word first names and common words shared across countries", () =>
    {
        notSame("Anastasia", "Анастасија");  // US singer ≠ Balkan singer
        notSame("Wiktoria", "Виктория");     // Swedish ≠ Russian
        notSame("Konstantin", "Константин");
        notSame("Karolina", "Каролина");
        notSame("Tatyana", "Татяна");
    });

    test("Arabic skeletons don't swallow unrelated Latin names", () =>
    {
        notSame("Sharon", "شيرين");         // shrn = shrn
        notSame("Onelight", "نوال الكويتية");
        notSame("NOISEMAKER", "يونس ميكري"); // nsmkr = nsmkr (Younes Migri)
    });

    test("scene peers with high Last.fm match stay separate", () =>
    {
        notSame("محمد عساف", "Toni Qattan");
        notSame("Иван Дорн", "Monatik");
        notSame("Hussain Al Jassmi", "عمر دياب");
        notSame("Δημήτρης Μητροπάνος", "George Dalaras");
        notSame("Abdullah Bilkhair", "عبدالله المناعي");
    });
});


// ─────────────────────────────────────────────────────────────
// 3. Known misses: same artist, not matched today (on purpose or not yet)
//    If a new rule fixes one, move it to group 1 and re-check group 2.
// ─────────────────────────────────────────────────────────────
describe("Known misses", () =>
{
    test("one-word names, even real pairs (the price of zero false merges)", () =>
    {
        notSame("Цеца", "Ceca");
        notSame("Кино", "Kino");
        notSame("Витас", "Vitas");
        notSame("Преслава", "Preslava");
        notSame("Монеточка", "MONETOCHKA");
        notSame("Блестящие", "Blestyashchiye");
        notSame("Антитіла", "Antytila");
        notSame("Μαρινέλλα", "Marinella");
        notSame("Γλυκερία", "Glykeria");
        notSame("Ռահվիրա", "Rahvira");
        notSame("მგზავრები", "Mgzavrebi");
        notSame("فيروز", "Fairuz");
        notSame("ذكرى", "Zekra");
        notSame("بلقيس", "Balqees");
    });

    test("Greek χ written as ch", () => notSame("Χριστίνα Μπαλτζή", "Christina Mpaltzi"));
    test("Arabic article written in one script only", () => notSame("الشاب خالد", "Cheb Khaled"));
    test("Ukrainian г written as h", () => notSame("Олег Винник", "Oleh Vynnyk"));
    test("extra vowel in a common Latin spelling", () => notSame("Արամ Խաչատրյան", "Aram Khachaturian"));
    test("Egyptian g for ج", () => notSame("جمال عبد الناصر", "Gamal Abdel Nasser"));
});


// ─────────────────────────────────────────────────────────────
// 4. Out of scope for Layer 2
// ─────────────────────────────────────────────────────────────
describe("Out of scope", () =>
{
    test("two Latin names that differ are never merged (Layer 1 only)", () =>
    {
        notSame("Beyoncé", "Beyonce");
        notSame("Haris Alexiou", "Charis Alexiou");
        notSame("Ana", "Anna");
    });

    test("two names in the same non-Latin script are never merged", () =>
    {
        notSame("Саша", "Саша Project");
        notSame("Клава Кока", "Клава Кокаа");
        notSame("محمد عساف", "محمد عساف الصغير");
    });

    test("two different non-Latin scripts are never merged", () =>
    {
        notSame("Нино Катамадзе", "ნინო კატამაძე");
    });

    test("unsupported scripts: Chinese, Japanese, Korean, Thai, Hebrew", () =>
    {
        notSame("周深", "Zhou Shen");
        notSame("宇多田ヒカル", "Utada Hikaru");
        notSame("소녀시대", "Girls' Generation");
        notSame("เฟย์ ฟาง แก้ว", "Faye Fang Kaew");
        notSame("אריק איינשטיין", "Arik Einstein");
    });
});


// ─────────────────────────────────────────────────────────────
// 5. Properties
// ─────────────────────────────────────────────────────────────
describe("Properties", () =>
{
    test("Layer 1 still decides first: same name after normalization", () =>
    {
        same("Radiohead", "RADIOHEAD");
        same("周深", "  周深 ");
        same("Ceca", "ceca");
    });

    test("symmetric: isSameArtist(a, b) === isSameArtist(b, a)", () =>
    {
        const names = ["Клава Кока", "Klava Koka", "Цеца", "Ceca", "محمد عساف", "Mohammad Assaf",
            "Sharon", "شيرين", "Χάρις Αλεξίου", "Haris Alexiou", "周深", "Zhou Shen", "Nanna", "На-На"];
        for (const a of names) for (const b of names)
        {
            assert.equal(isSameArtist(a, b), isSameArtist(b, a), `not symmetric for "${a}" / "${b}"`);
        }
    });

    test("keys are plain lowercase Latin (or digits) for supported scripts", () =>
    {
        for (const name of ["Клава Кока", "Ђорђе Балашевић", "Χάρις Αλεξίου", "Ռահվիրա", "მგზავრები"])
        {
            assert.match(looseKey(name), /^[a-z0-9]+$/, `looseKey("${name}") = "${looseKey(name)}"`);
        }
        for (const name of ["محمد عساف", "عبدالله طارق", "ماجدة الرومي"])
        {
            assert.match(skeletonKey(name), /^[a-z0-9]+$/, `skeletonKey("${name}") = "${skeletonKey(name)}"`);
        }
    });

    test("keys are deterministic", () =>
    {
        assert.equal(looseKey("Клава Кока"), looseKey("Клава Кока"));
        assert.equal(skeletonKey("محمد عساف"), skeletonKey("محمد عساف"));
    });

    test("strange input doesn't crash", () =>
    {
        for (const name of ["🎹", "!!!", "112", "Radio\uD800head", "a".repeat(500), "ـــ", "Ак-47"])
        {
            assert.doesNotThrow(() => isSameArtist(name, "Klava Koka"));
            assert.doesNotThrow(() => looseKey(name));
            assert.doesNotThrow(() => skeletonKey(name));
        }
    });

    test("wrong input types throw a TypeError", () =>
    {
        for (const bad of [null, undefined, 42, ["Klava Koka"], {}])
        {
            assert.throws(() => isSameArtist(bad, "Klava Koka"), TypeError);
            assert.throws(() => isSameArtist("Klava Koka", bad), TypeError);
            assert.throws(() => looseKey(bad), TypeError);
            assert.throws(() => skeletonKey(bad), TypeError);
        }
    });
});