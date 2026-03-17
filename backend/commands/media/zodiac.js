const horoscopes = {
    aries: {
        symbol: "♈", dates: "Mar 21 - Apr 19", element: "🔥 Fire",
        traits: "Bold, ambitious, confident",
        readings: [
            "Today brings exciting opportunities! Your natural leadership will shine. Take that bold step you've been considering. 💪",
            "Romance is in the air! Someone special might catch your eye. Keep your energy positive and magnetic. ❤️",
            "Financial luck is on your side today. A smart investment or career move could pay off big. Trust your instincts. 💰",
            "Your competitive spirit is at its peak! Channel it into something productive. A challenge at work will reveal your strength. 🏆",
            "Time to slow down and recharge. Even warriors need rest. Spend quality time with loved ones today. 🌙"
        ]
    },
    taurus: {
        symbol: "♉", dates: "Apr 20 - May 20", element: "🌍 Earth",
        traits: "Reliable, patient, devoted",
        readings: [
            "Stability is your superpower today. A financial decision you've been pondering will become clear. Trust the process. 🌿",
            "Love is blossoming! Your loyal nature attracts genuine connections. Open your heart to new possibilities. 💕",
            "Your determination pays off today. That project you've been grinding on is about to bear fruit. Keep pushing! 🎯",
            "Indulge in self-care today. You deserve it! A spa day, good food, or nature walk will revitalize your soul. 🧖",
            "A surprise gift or unexpected opportunity comes your way. Your patience has been rewarded. Stay grateful! 🎁"
        ]
    },
    gemini: {
        symbol: "♊", dates: "May 21 - Jun 20", element: "💨 Air",
        traits: "Curious, adaptable, witty",
        readings: [
            "Your communication skills are unmatched today! Share your ideas boldly — people are ready to listen. 🗣️",
            "An exciting social opportunity awaits. Your charm will open doors you didn't know existed. Network away! 🌟",
            "Your dual nature helps you see both sides today. Use this gift to resolve a conflict or make a wise decision. ⚖️",
            "Creativity flows freely! Write, create, or brainstorm — your mind is a goldmine of brilliant ideas today. 💡",
            "Travel or learning something new is favored. Sign up for that course or plan that trip. Adventure calls! ✈️"
        ]
    },
    cancer: {
        symbol: "♋", dates: "Jun 21 - Jul 22", element: "💧 Water",
        traits: "Intuitive, sentimental, protective",
        readings: [
            "Your intuition is razor-sharp today. Trust your gut feelings — they won't lead you astray. 🔮",
            "Family bonds strengthen today. A heartfelt conversation will bring you closer to someone special. 👨‍👩‍👧‍👦",
            "Emotional healing is on the agenda. Let go of past hurts and embrace the fresh energy coming your way. 🌊",
            "Your nurturing nature attracts grateful souls. Someone needs your support today — be the lighthouse. 💙",
            "Home improvements or domestic changes bring joy. Create your sanctuary. Your comfort zone expands beautifully. 🏡"
        ]
    },
    leo: {
        symbol: "♌", dates: "Jul 23 - Aug 22", element: "🔥 Fire",
        traits: "Creative, passionate, generous",
        readings: [
            "The spotlight is yours today! Your charisma is magnetic. Lead with confidence and watch others follow. 👑",
            "Romance sizzles! Your passionate energy draws admirers. If single, someone exciting enters your orbit. 🔥",
            "Your creativity peaks today. Express yourself through art, fashion, or any form of self-expression. 🎨",
            "A leadership opportunity presents itself. You were born for this moment. Step up and shine bright! ⭐",
            "Generosity comes back tenfold. Your kind heart inspires others. Expect unexpected rewards for your goodness. 💝"
        ]
    },
    virgo: {
        symbol: "♍", dates: "Aug 23 - Sep 22", element: "🌍 Earth",
        traits: "Analytical, practical, loyal",
        readings: [
            "Your attention to detail saves the day! A problem everyone overlooked is clear to your sharp eyes. 🔍",
            "Health and wellness are in focus. Start that routine you've been planning. Your body will thank you. 🏋️",
            "A work project reaches completion. Your meticulousness has paid off beautifully. Celebrate your success! ✅",
            "Organization brings peace of mind. Declutter your space and watch your mental clarity improve. 🧹",
            "Someone values your honest advice today. Your practical wisdom helps them navigate a tough situation. 💎"
        ]
    },
    libra: {
        symbol: "♎", dates: "Sep 23 - Oct 22", element: "💨 Air",
        traits: "Diplomatic, gracious, fair",
        readings: [
            "Harmony surrounds you today. Your balanced approach resolves tensions and brings peace to those around you. ⚖️",
            "Beauty and aesthetics inspire you. Redecorate, update your style, or visit something visually stunning. 🌸",
            "Partnership energy is strong. Whether business or romance, collaboration leads to amazing results. 🤝",
            "Your social calendar fills up! Accept those invitations — meaningful connections await at gatherings. 🎉",
            "Justice prevails today. A fair outcome in a situation that's been weighing on you brings relief. ✨"
        ]
    },
    scorpio: {
        symbol: "♏", dates: "Oct 23 - Nov 21", element: "💧 Water",
        traits: "Passionate, resourceful, powerful",
        readings: [
            "Your intensity is your greatest asset today. Channel it into transformation and watch miracles happen. 🦅",
            "Deep connections deepen further. A meaningful conversation reveals hidden truths and strengthens bonds. 🔮",
            "Financial strategy pays off. Your research and instinct combine for a powerful money move. 💰",
            "Mystery surrounds you in the best way. Your enigmatic energy draws curious and worthy souls. 🌙",
            "Transformation is at hand. Let go of what no longer serves you. A powerful new chapter begins. 🔥"
        ]
    },
    sagittarius: {
        symbol: "♐", dates: "Nov 22 - Dec 21", element: "🔥 Fire",
        traits: "Adventurous, optimistic, philosophical",
        readings: [
            "Adventure calls loud today! Say yes to spontaneous plans. The universe rewards your boldness. 🏹",
            "Your optimism inspires everyone around you. Share your positive outlook and watch it multiply. ☀️",
            "Learning something new brings unexpected opportunities. Knowledge is your greatest treasure today. 📚",
            "Travel plans materialize! Whether near or far, exploring new places expands your horizons beautifully. 🌍",
            "Your philosophical side shines. Share your wisdom — someone needs to hear exactly what you have to say. 🧠"
        ]
    },
    capricorn: {
        symbol: "♑", dates: "Dec 22 - Jan 19", element: "🌍 Earth",
        traits: "Disciplined, responsible, ambitious",
        readings: [
            "Your hard work reaches a milestone today. The discipline you've maintained is about to be rewarded. 🏔️",
            "Career advancement is written in the stars. A promotion, raise, or recognition is heading your way. 📈",
            "Your practical wisdom guides a financial decision perfectly. Trust your experience and make the move. 💼",
            "Mentorship opportunity arises. Share your journey with someone younger — your story inspires greatness. 🎓",
            "Rest is productive too. Allow yourself to recover and strategize. Tomorrow's climb requires today's rest. 🌄"
        ]
    },
    aquarius: {
        symbol: "♒", dates: "Jan 20 - Feb 18", element: "💨 Air",
        traits: "Progressive, original, humanitarian",
        readings: [
            "Innovation strikes! Your unique perspective solves a problem nobody else could crack. Think different! 💡",
            "Community connections strengthen. Your humanitarian spirit attracts like-minded souls. Build your tribe. 🌐",
            "Technology favors you today. A digital opportunity, new app, or tech solution improves your life. 📱",
            "Your originality is celebrated. Don't dim your light to fit in — the world needs your unique vision. 🌈",
            "Social justice matters to you today. Take action on something you believe in. Your voice matters. ✊"
        ]
    },
    pisces: {
        symbol: "♓", dates: "Feb 19 - Mar 20", element: "💧 Water",
        traits: "Compassionate, intuitive, artistic",
        readings: [
            "Your creative energy overflows! Paint, write, sing, or create — art is your superpower today. 🎨",
            "Intuition guides you perfectly. Those gut feelings? They're messages from the universe. Listen closely. 🌊",
            "Compassion attracts gratitude. Someone you helped comes back with unexpected kindness. The cycle continues. 💙",
            "Dreams carry meaningful messages tonight. Keep a journal by your bed and decode the symbolism. 🌙",
            "Spiritual growth accelerates. Meditation, prayer, or quiet reflection brings profound insights today. 🕊️"
        ]
    }
};

const signs = Object.keys(horoscopes);

import { getCachedConfig } from "../../services/configService.js";

export const zodiac = async (sock, m, args) => {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const sign = args[0]?.toLowerCase();

    if (!sign || !horoscopes[sign]) {
        const signList = signs.map(s => {
            const h = horoscopes[s];
            return `${h.symbol} *${s.charAt(0).toUpperCase() + s.slice(1)}* — ${h.dates}`;
        }).join("\n");

        return `╔══════════════════════════════════╗
║   🔮 *ℤ𝕆𝔻𝕀𝔸ℂ ℍ𝕆ℝ𝕆𝕊ℂ𝕆ℙ𝔼* 🔮       ║
╚══════════════════════════════════╝

This command shows today's horoscope for the zodiac sign you choose.

*Usage:* ${p}zodiac <sign>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${signList}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Example:* ${p}zodiac leo`;
    }

    const h = horoscopes[sign];
    const reading = h.readings[Math.floor(Math.random() * h.readings.length)];
    const displayName = sign.charAt(0).toUpperCase() + sign.slice(1);

    return `╔══════════════════════════════════╗
║   🔮 *ℤ𝕆𝔻𝕀𝔸ℂ ℍ𝕆ℝ𝕆𝕊ℂ𝕆ℙ𝔼* 🔮       ║
╚══════════════════════════════════╝

${h.symbol} *${displayName}*
📅 ${h.dates}
🌀 ${h.element}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ *Traits:* ${h.traits}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔮 *Today's Reading:*

${reading}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Check back daily for new readings_ ⭐`;
};
