"""Narração por cena com edge-tts (voz neural pt-BR) + tempos de cada palavra para as legendas.

Saída em video/assets/audio/: <cena>.mp3, <cena>.wav (48 kHz) e <cena>.words.json.
Para trocar por locução humana: grave <cena>.wav com o mesmo nome e rode build.mjs sem este passo
(as legendas passam a usar a divisão proporcional por frase).
"""
import asyncio, json, pathlib, subprocess, sys, wave
import edge_tts

TOOLS = pathlib.Path(__file__).parent
OUT = TOOLS.parent / 'assets' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)
FFMPEG = TOOLS / 'node_modules' / 'ffmpeg-static' / 'ffmpeg.exe'
script = json.loads((TOOLS / 'script.json').read_text(encoding='utf-8'))


async def synth(scene):
    mp3 = OUT / f"{scene['id']}.mp3"
    words = []
    com = edge_tts.Communicate(scene['narration'], script['voice'], rate=script['rate'], boundary='WordBoundary')
    with open(mp3, 'wb') as f:
        async for chunk in com.stream():
            if chunk['type'] == 'audio':
                f.write(chunk['data'])
            elif chunk['type'] == 'WordBoundary':
                # offset/duração em unidades de 100 ns
                words.append({'t': chunk['offset'] / 1e7, 'd': chunk['duration'] / 1e7, 'w': chunk['text']})
    wav = OUT / f"{scene['id']}.wav"
    subprocess.run([str(FFMPEG), '-loglevel', 'error', '-y', '-i', str(mp3), '-ar', '48000', '-ac', '2', str(wav)], check=True)
    with wave.open(str(wav)) as w:
        dur = w.getnframes() / w.getframerate()
    (OUT / f"{scene['id']}.words.json").write_text(json.dumps({'duration': dur, 'words': words}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"{scene['id']}: {dur:.2f}s, {len(words)} palavras")


async def main():
    only = set(sys.argv[1:])
    for s in script['scenes']:
        if not only or s['id'] in only:
            await synth(s)

asyncio.run(main())
