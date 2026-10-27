// Renderiza a composição (video/composition) quadro a quadro com o Chrome e monta o MP4 final.
// As legendas vão gravadas na imagem; legendas.srt acompanha o vídeo para plataformas (YouTube, Instagram).
//   node render.mjs --stills 3,25,70     → PNGs de prévia em tools/tmp/
//   node render.mjs                      → video/estuvia-apresentacao.mp4 (imagem + narração + trilha + legendas)
//   node render.mjs --mux                → refaz só o áudio sobre o vídeo já renderizado
//   node render.mjs --from 60 --to 90    → só um trecho (tools/tmp/trecho.mp4, sem áudio)
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TOOLS, VIDEO } from './lib.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const read = (f) => JSON.parse(fs.readFileSync(path.join(TOOLS, f), 'utf8'));
const timeline = read('timeline.json');
const cues = read('cues.json');
const words = Object.fromEntries(timeline.scenes.map((s) => [s.id, JSON.parse(fs.readFileSync(path.join(VIDEO, 'assets', 'audio', `${s.id}.words.json`), 'utf8')).words]));
const TMP = path.join(TOOLS, 'tmp'); fs.mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--allow-file-access-from-files', '--font-render-hinting=none'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) console.log('[comp]', m.text()); });
page.on('pageerror', (e) => console.log('[comp error]', e.message));
await page.goto(pathToFileURL(path.join(VIDEO, 'composition', 'index.html')).href);
await page.evaluate((d) => window.setup(d), { timeline, cues, words });
await page.evaluate(() => document.fonts.ready);

const stills = arg('--stills');
const muxOnly = process.argv.includes('--mux'); // só refaz o áudio sobre o vídeo já renderizado
if (stills) {
  for (const t of stills.split(',').map(Number)) {
    await page.evaluate((x) => window.renderAt(x), t);
    const f = path.join(TMP, `still-${String(t).replace('.', '_')}.png`);
    await page.screenshot({ path: f });
    console.log(f);
  }
  await browser.close();
  process.exit(0);
}

const fps = timeline.fps;
const from = Number(arg('--from') ?? 0), to = Number(arg('--to') ?? timeline.total);
const partial = arg('--from') != null || arg('--to') != null;
const silent = path.join(TMP, partial ? 'trecho.mp4' : 'video-sem-audio.mp4');
const enc = spawn(ffmpegPath, muxOnly ? ['-version'] : ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const frames = muxOnly ? 0 : Math.round((to - from) * fps);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate((x) => window.renderAt(x), from + i / fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
  if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
  if (i % 150 === 0) console.log(`quadro ${i}/${frames} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
enc.stdin.end();
if (!muxOnly) await new Promise((r) => enc.on('close', r)); else enc.kill();
await browser.close();
console.log('vídeo sem áudio:', silent);
if (partial) process.exit(0);

// ---------- Áudio: narração posicionada por cena + trilha com ducking + whooshes ----------
const A = (f) => path.join(VIDEO, 'assets', 'audio', f);
const inputs = ['-i', silent, '-i', A('trilha.wav'), '-i', A('whooshes.wav')];
const voiceLabels = [];
let filter = '';
timeline.scenes.forEach((s, i) => {
  inputs.push('-i', A(`${s.id}.wav`));
  const ms = Math.round(s.voiceAt * 1000);
  filter += `[${i + 3}:a]adelay=${ms}|${ms},apad[v${i}];`;
  voiceLabels.push(`[v${i}]`);
});
filter += `${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:normalize=0,atrim=0:${timeline.total},highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,volume=1.6,asplit=2[voz][chave];`;
filter += `[1:a]volume=0.4[mus];[mus][chave]sidechaincompress=threshold=0.015:ratio=10:attack=30:release=600:makeup=1[musd];`;
filter += `[2:a]volume=0.5[wh];[voz][musd][wh]amix=inputs=3:normalize=0,alimiter=limit=0.95,loudnorm=I=-15:TP=-1.5:LRA=11[aout]`;
const out = path.join(VIDEO, 'estuvia-apresentacao.mp4');
const mux = spawn(ffmpegPath, ['-loglevel', 'error', '-y', ...inputs,
  '-filter_complex', filter, '-map', '0:v', '-map', '[aout]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-metadata:s:a:0', 'language=eng', '-t', String(timeline.total),
  '-metadata', 'title=Estuvia — apresentação', '-metadata', 'artist=Nexforge', '-movflags', '+faststart', out], { stdio: 'inherit' });
await new Promise((r) => mux.on('close', r));
console.log('pronto:', out);
