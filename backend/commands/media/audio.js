import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { promisify } from "util";
import { getCachedConfig } from "../../services/configService.js";

const execPromise = promisify(exec);

// Helper to process audio with ffmpeg
async function processAudio(sock, m, filter) {
    const config = await getCachedConfig(sock.sessionId);
    const p = config.prefix || "!";
    const remoteJid = m.key.remoteJid;
    const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage || m.message;
    
    // Check if it's audio
    const isAudio = !!quoted.audioMessage;
    if (!isAudio) {
        return `⚠️ This command changes the sound of a replied audio or voice note.\n\nReply to an audio or voice note, then use an effect command.\n\n*Example:* ${p}bass`;
    }

    try {
        const buffer = await downloadMediaMessage(
            { message: quoted },
            "buffer",
            {},
            { reuploadRequest: sock.updateMediaMessage }
        );

        const tempInput = path.join("/tmp", `input_${Date.now()}.mp3`);
        const tempOutput = path.join("/tmp", `output_${Date.now()}.mp3`);

        fs.writeFileSync(tempInput, buffer);

        // Run ffmpeg
        await execPromise(`ffmpeg -i ${tempInput} -af "${filter}" ${tempOutput}`);

        const outputBuffer = fs.readFileSync(tempOutput);

        await sock.sendMessage(remoteJid, {
            audio: outputBuffer,
            mimetype: "audio/mp4",
            ptt: !!quoted.audioMessage?.ptt // Keep PTT status if original was PTT
        }, { quoted: m });

        // Cleanup
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);

    } catch (err) {
        console.error("Audio processing error:", err.message);
        return `❌ Error processing audio: ${err.message}`;
    }
}

// Effect Exports
export const avec = async (sock, m) => processAudio(sock, m, "aecho=0.8:0.88:60:0.4");
export const bass = async (sock, m) => processAudio(sock, m, "bass=g=15,dynamicaudionorm");
export const black = async (sock, m) => processAudio(sock, m, "tremolo=f=10:d=0.5");
export const blown = async (sock, m) => processAudio(sock, m, "acrusher=level_in=8:level_out=18:bits=8:mode=log:aa=1");
export const cut = async (sock, m) => processAudio(sock, m, "atrim=end=5");
export const deep = async (sock, m) => processAudio(sock, m, "atempo=1.2,asetrate=44100*0.5");
export const earrape = async (sock, m) => processAudio(sock, m, "volume=10");
export const fast = async (sock, m) => processAudio(sock, m, "atempo=2.0");
export const fat = async (sock, m) => processAudio(sock, m, "bass=g=20,firequalizer=gain_entry='entry(0,10);entry(250,10);entry(4000,0);entry(16000,0)'");
export const histo = async (sock, m) => processAudio(sock, m, "firequalizer=gain_entry='entry(0,-20);entry(200,0);entry(4000,0);entry(16000,-20)'");
export const low = async (sock, m) => processAudio(sock, m, "lowpass=f=450");
export const nightcore = async (sock, m) => processAudio(sock, m, "asetrate=44100*1.25,atempo=1.25");
export const pitch = async (sock, m) => processAudio(sock, m, "asetrate=44100*1.5,atempo=0.7");
export const robot = async (sock, m) => processAudio(sock, m, "afftfilt=\"real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)'\"");
export const slow = async (sock, m) => processAudio(sock, m, "atempo=0.5");
export const smooth = async (sock, m) => processAudio(sock, m, "vibrato=f=4:d=0.3");
export const treble = async (sock, m) => processAudio(sock, m, "treble=g=15");
