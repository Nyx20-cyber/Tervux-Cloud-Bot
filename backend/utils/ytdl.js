import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomBytes } from 'crypto';

let warnedMissingCookies = false;

const resolveCookiesFile = () => {
    // Optional env override (still supported), then fixed project/container paths.
    const envPath = String(process.env.YTDLP_COOKIES_FILE || '').trim();
    const candidates = [
        envPath,
        path.resolve('./cookies.txt'),
        path.resolve('./backend/cookies.txt'),
        '/app/cookies.txt'
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return '';
};

/**
 * Downloads YouTube media using the local bin/yt-dlp binary.
 * @param {string} url - YouTube URL
 * @param {string} type - 'audio' or 'video'
 * @returns {Promise<Buffer>} - Media buffer
 */
export const downloadYT = async (url, type = 'audio') => {
    const ext = type === 'audio' ? 'm4a' : 'mp4';
    const tempFile = path.join(os.tmpdir(), `ytdl_${randomBytes(6).toString('hex')}.${ext}`);
    const ytDlpPath = path.resolve('./bin/yt-dlp');
    const cookiesFile = resolveCookiesFile();
    const nodeRuntimePath = process.execPath;

    const baseArgs = [
        '--no-playlist',
        '--no-warnings',
        '--no-progress',
        '--socket-timeout', '20',
        '--retries', '2'
    ];
    if (nodeRuntimePath) {
        baseArgs.push('--js-runtimes', `node:${nodeRuntimePath}`);
    } else {
        baseArgs.push('--js-runtimes', 'node');
    }
    if (cookiesFile) {
        baseArgs.push('--cookies', cookiesFile);
    } else if (!warnedMissingCookies) {
        warnedMissingCookies = true;
        console.warn(
            "[yt-dlp] No cookies file found. For best YouTube success add cookies at /app/cookies.txt (or backend/cookies.txt)."
        );
    }

    const formatArgs = type === 'audio'
        ? ['-f', 'bestaudio[ext=m4a]/bestaudio[acodec!=none]/bestaudio']
        : ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'];

    const runAttempt = (extractorArgs) => new Promise((resolve, reject) => {
        const args = [
            ...baseArgs,
            '--extractor-args', extractorArgs,
            ...formatArgs,
            '-o', tempFile,
            url
        ];
        const child = spawn(ytDlpPath, args);
        let errorData = '';

        child.stderr.on('data', (data) => {
            errorData += data.toString();
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`yt-dlp failed with code ${code}: ${errorData}`));
        });
    });

    try {
        // Strategy 1: mobile-like clients reduce bot-check friction.
        await runAttempt('youtube:player_client=android,web');
    } catch (firstErr) {
        try {
            // Strategy 2 fallback: allow additional clients.
            await runAttempt('youtube:player_client=tv_embedded,android,web');
        } catch (secondErr) {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            throw secondErr.message?.includes('Sign in to confirm you’re not a bot')
                ? new Error(
                    `YouTube blocked direct download for this video. ` +
                    `Set YTDLP_COOKIES_FILE to exported YouTube cookies, then retry.\n` +
                    `Details: ${secondErr.message}`
                )
                : secondErr;
        }
    }

    try {
        const buffer = fs.readFileSync(tempFile);
        fs.unlinkSync(tempFile);
        return buffer;
    } catch (readErr) {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        throw new Error(`Failed to read downloaded file: ${readErr.message}`);
    }
};
