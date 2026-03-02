const charMap = {
    a: "ａ", b: "ｂ", c: "ｃ", d: "ｄ", e: "ｅ", f: "ｆ", g: "ｇ", h: "ｈ",
    i: "ｉ", j: "ｊ", k: "ｋ", l: "ｌ", m: "ｍ", n: "ｎ", o: "ｏ", p: "ｐ",
    q: "ｑ", r: "ｒ", s: "ｓ", t: "ｔ", u: "ｕ", v: "ｖ", w: "ｗ", x: "ｘ",
    y: "ｙ", z: "ｚ",
    A: "Ａ", B: "Ｂ", C: "Ｃ", D: "Ｄ", E: "Ｅ", F: "Ｆ", G: "Ｇ", H: "Ｈ",
    I: "Ｉ", J: "Ｊ", K: "Ｋ", L: "Ｌ", M: "Ｍ", N: "Ｎ", O: "Ｏ", P: "Ｐ",
    Q: "Ｑ", R: "Ｒ", S: "Ｓ", T: "Ｔ", U: "Ｕ", V: "Ｖ", W: "Ｗ", X: "Ｘ",
    Y: "Ｙ", Z: "Ｚ",
    "0": "０", "1": "１", "2": "２", "3": "３", "4": "４",
    "5": "５", "6": "６", "7": "７", "8": "８", "9": "９",
    " ": "　"
};

const tinyMap = {
    a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ",
    i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ",
    q: "q", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ",
    y: "ʸ", z: "ᶻ"
};

const bubbleMap = {
    a: "ⓐ", b: "ⓑ", c: "ⓒ", d: "ⓓ", e: "ⓔ", f: "ⓕ", g: "ⓖ", h: "ⓗ",
    i: "ⓘ", j: "ⓙ", k: "ⓚ", l: "ⓛ", m: "ⓜ", n: "ⓝ", o: "ⓞ", p: "ⓟ",
    q: "ⓠ", r: "ⓡ", s: "ⓢ", t: "ⓣ", u: "ⓤ", v: "ⓥ", w: "ⓦ", x: "ⓧ",
    y: "ⓨ", z: "ⓩ"
};

const flipMap = {
    a: "ɐ", b: "q", c: "ɔ", d: "p", e: "ǝ", f: "ɟ", g: "ƃ", h: "ɥ",
    i: "ᴉ", j: "ɾ", k: "ʞ", l: "l", m: "ɯ", n: "u", o: "o", p: "d",
    q: "b", r: "ɹ", s: "s", t: "ʇ", u: "n", v: "ʌ", w: "ʍ", x: "x",
    y: "ʎ", z: "z"
};

function transform(text, map) {
    return text.split("").map(c => map[c] || map[c.toLowerCase()] || c).join("");
}

import { getCachedConfig } from "../../services/configService.js";

export const aesthetic = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const text = args.join(" ");

    if (!text) {
        return `╔══════════════════════════════════╗
║   ✨ *𝔸𝔼𝕊𝕋ℍ𝔼𝕋𝕀ℂ 𝕋𝔼𝕏𝕋* ✨          ║
╚══════════════════════════════════╝

*Usage:* ${p}aesthetic <text>
*Example:* ${p}aesthetic hello world`;
    }

    const vaporwave = transform(text, charMap);
    const spaced = text.split("").join(" ");
    const tiny = transform(text.toLowerCase(), tinyMap);
    const bubble = transform(text.toLowerCase(), bubbleMap);
    const flipped = transform(text.toLowerCase(), flipMap).split("").reverse().join("");

    return `╔══════════════════════════════════╗
║   ✨ *𝔸𝔼𝕊𝕋ℍ𝔼𝕋𝕀ℂ 𝕋𝔼𝕏𝕋* ✨          ║
╚══════════════════════════════════╝

🌊 *Vaporwave:*
${vaporwave}

📐 *Spaced:*
${spaced}

🔬 *Tiny:*
${tiny}

🫧 *Bubble:*
${bubble}

🙃 *Flipped:*
${flipped}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Copy your favorite style!_ ✂️`;
};
