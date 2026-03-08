import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const soundsDir = path.join(__dirname, "..", "assets", "sounds");

const jobs = [
  {
    name: "welcome-intro.mp3",
    text: "Welcome to Tervux Cloud Bot. Your device is now connected successfully. Powered by Tervux and AllanMox. Next, open bot dot tervux dot com, buy coins, deploy your bot, and configure your settings."
  },
  {
    name: "deploy-success.mp3",
    text: "Congratulations. Your bot has been deployed successfully using fifty coins. It is now active twenty four hours a day for thirty days. Open your dashboard to configure features and run help commands."
  }
];

const bins = ["msedge-tts", "edge-tts"];
const voices = ["en-US-ChristopherNeural", "en-GB-RyanNeural"];
const ttsRate = process.env.TTS_RATE || "+35%";

async function run() {
  await mkdir(soundsDir, { recursive: true });
  for (const job of jobs) {
    const outPath = path.join(soundsDir, job.name);
    let ok = false;
    let lastError = null;

    for (const bin of bins) {
      for (const voice of voices) {
        try {
          await execFileAsync(bin, [
            "--voice",
            voice,
            "--rate",
            ttsRate,
            "--text",
            job.text,
            "--write-media",
            outPath
          ], { timeout: 60_000, maxBuffer: 1024 * 1024 * 4 });
          console.log(`[TTS] Generated ${job.name} via ${bin} (${voice}, rate=${ttsRate})`);
          ok = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (ok) break;
    }

    if (!ok) {
      console.error(`[TTS] Failed generating ${job.name}`);
      if (lastError?.message) console.error(lastError.message);
      process.exitCode = 1;
      return;
    }
  }

  console.log("[TTS] All voice files generated in backend/assets/sounds");
}

run().catch((err) => {
  console.error("[TTS] Fatal:", err.message);
  process.exit(1);
});
