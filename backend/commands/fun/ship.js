export const ship = async (sock, m, args) => {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid.endsWith("@g.us")) {
        return `╔══════════════════════════════════╗
║         💔 *𝕆𝕆ℙ𝕊!* 💔            ║
╚══════════════════════════════════╝

This command is only for group fun!
Add me to a group and try again.`;
    }

    let target1, target2;
    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (mentions.length >= 2) {
        target1 = mentions[0];
        target2 = mentions[1];
    } else if (mentions.length === 1) {
        target1 = m.key.participant || m.key.remoteJid;
        target2 = mentions[0];
    } else {
        try {
            const metadata = await sock.groupMetadata(remoteJid);
            const participants = metadata.participants;
            const shuffled = participants.sort(() => 0.5 - Math.random());
            target1 = shuffled[0].id;
            target2 = shuffled[1].id;
        } catch (err) {
            return "❌ Couldn't find victims... I mean, candidates!";
        }
    }

    const lovePercentage = Math.floor(Math.random() * 101);
    let comment = "";
    let loveBar = "";

    const filled = Math.floor(lovePercentage / 10);
    loveBar = "▓".repeat(filled) + "░".repeat(10 - filled);

    if (lovePercentage > 90) comment = "🔥 𝕊𝕠𝕦𝕝𝕞𝕒𝕥𝕖𝕤! Wedding bells are ringing!";
    else if (lovePercentage > 70) comment = "💖 ℍ𝕚𝕘𝕙 𝕔𝕠𝕞𝕡𝕒𝕥𝕚𝕓𝕚𝕝𝕚𝕥𝕪! Sparks flying!";
    else if (lovePercentage > 50) comment = "💓 𝕋𝕙𝕖𝕣𝕖'𝕤 𝕙𝕠𝕡𝕖! Keep trying!";
    else if (lovePercentage > 30) comment = "💔 𝔽𝕣𝕚𝕖𝕟𝕕𝕫𝕠𝕟𝕖 alert! Ouch...";
    else comment = "💀 𝕋𝕠𝕩𝕚𝕔! Run away fast!";

    const message = `╔══════════════════════════════════╗
║ 💘 *𝕋𝔼ℝ𝕍𝕌𝕏 𝕃𝕆𝕍𝔼 ℂ𝔸𝕃ℂ𝕌𝕃𝔸𝕋𝕆ℝ* 💘 ║
╚══════════════════════════════════╝

👤 @${target1.split("@")[0]}
         💕
👤 @${target2.split("@")[0]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *ℂ𝕆𝕄ℙ𝔸𝕋𝕀𝔹𝕀𝕃𝕀𝕋𝕐 ℝ𝔼𝕊𝕌𝕃𝕋𝕊*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 *𝕄𝕒𝕥𝕔𝕙:* ${lovePercentage}%
📈 *𝕃𝕖𝕧𝕖𝕝:* [${loveBar}]

✨ *𝕍𝕖𝕣𝕕𝕚𝕔𝕥:*
${comment}`;

    return {
        text: message,
        mentions: [target1, target2]
    };
};
