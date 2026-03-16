import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Load Religion Data
let QURAN_VERSES = [];
let BIBLE_VERSES = [];
try {
    const dataPath = join(process.cwd(), "assets", "religion_data.json");
    if (existsSync(dataPath)) {
        const raw = readFileSync(dataPath, "utf-8");
        const data = JSON.parse(raw);
        QURAN_VERSES = data.quran || [];
        BIBLE_VERSES = data.bible || [];
    }
} catch (e) {
    console.error("❌ Failed to load religion database:", e.message);
}

const formatVerse = (type, data) => {
    const title = type === 'BIBLE' ? '📖 *𝔹𝕀𝔹𝕃𝔼 𝕍𝔼ℝ𝕊𝔼*' : '🌙 *ℚ𝕌ℝ𝔸ℕ 𝕍𝔼ℝ𝕊𝔼*';
    const lessonText = data.lesson ? `\n\n💡 *𝕃𝔼𝕊𝕊𝕆ℕ:* _${data.lesson}_` : '';

    return `╔══════════════════════════════════╗
║    ${title}     ║
╚══════════════════════════════════╝

"${data.text}"
${lessonText}

📌 *ℝ𝕖𝕗𝕖𝕣𝕖𝕟𝕔𝕖:* ${data.verse}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_May this message bring you peace and strength._ ✨`;
};

export const bible = async (sock, m) => {
    const verses = BIBLE_VERSES;
    const random = verses[Math.floor(Math.random() * verses.length)];
    return formatVerse('BIBLE', random);
};

export const quran = async (sock, m) => {
    const verses = QURAN_VERSES.length > 0 ? QURAN_VERSES : [{ verse: "N/A", text: "Database loading...", lesson: "Please wait." }];
    const random = verses[Math.floor(Math.random() * verses.length)];
    return formatVerse('QURAN', random);
};

export const verse = async (sock, m) => {
    const all = [
        ...BIBLE_VERSES.map(v => ({...v, type: 'BIBLE'})), 
        ...QURAN_VERSES.map(v => ({...v, type: 'QURAN'}))
    ];
    const random = all[Math.floor(Math.random() * all.length)];
    return formatVerse(random.type, random);
};
