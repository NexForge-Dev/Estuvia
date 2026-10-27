"""Legendas a partir dos tempos de palavra da narração: video/legendas.srt + tools/cues.json.

Quebra por pontuação e por tamanho (até ~74 caracteres, 2 linhas de ~37). Usa o texto do roteiro
(com pontuação) e os tempos do TTS, palavra a palavra.
"""
import json, pathlib, re

TOOLS = pathlib.Path(__file__).parent
VIDEO = TOOLS.parent
AUDIO = VIDEO / 'assets' / 'audio'
script = {s['id']: s for s in json.loads((TOOLS / 'script.json').read_text(encoding='utf-8'))['scenes']}
tl = json.loads((TOOLS / 'timeline.json').read_text(encoding='utf-8'))
MAX = 74

cues = []
for sc in tl['scenes']:
    words = json.loads((AUDIO / f"{sc['id']}.words.json").read_text(encoding='utf-8'))['words']
    tokens = script[sc['id']]['narration'].split()
    # alinha os tokens do roteiro (com pontuação) aos tempos do TTS (sem pontuação)
    norm = lambda s: re.sub(r'[^\wÀ-ÿ]', '', s.lower())
    timed, j = [], 0
    for tok in tokens:
        while j < len(words) and norm(words[j]['w']) == '' : j += 1
        w = words[min(j, len(words) - 1)]
        if j < len(words) and norm(words[j]['w']) != norm(tok):
            # tokens compostos (ex.: "Agenda AI"): procura adiante
            for k in range(j, min(j + 3, len(words))):
                if norm(words[k]['w']) == norm(tok): j = k; w = words[k]; break
        timed.append((tok, sc['voiceAt'] + w['t'], sc['voiceAt'] + w['t'] + w['d']))
        j += 1
    cur = []
    def flush():
        if cur:
            cues.append({'start': cur[0][1], 'end': cur[-1][2], 'text': ' '.join(t[0] for t in cur)})
            cur.clear()
    for tok in timed:
        if cur and len(' '.join(t[0] for t in cur) + ' ' + tok[0]) > MAX: flush()
        cur.append(tok)
        if re.search(r'[.?!]$', tok[0]) or (re.search(r',$', tok[0]) and len(' '.join(t[0] for t in cur)) > 40): flush()
    flush()

# tempos finais: um pouco de folga, sem sobreposição
for i, c in enumerate(cues):
    c['end'] = c['end'] + 0.25
    if i + 1 < len(cues): c['end'] = min(c['end'], cues[i + 1]['start'] - 0.04)
    c['start'] = round(c['start'], 3); c['end'] = round(max(c['end'], c['start'] + 0.8), 3)
    # duas linhas equilibradas
    t = c['text']
    if len(t) > 40:
        ws = t.split(); best = None
        for k in range(1, len(ws)):
            a, b = ' '.join(ws[:k]), ' '.join(ws[k:])
            score = abs(len(a) - len(b))
            if best is None or score < best[0]: best = (score, a + '\n' + b)
        c['text'] = best[1]

def ts(x):
    h, r = divmod(x, 3600); m, s = divmod(r, 60)
    return f"{int(h):02}:{int(m):02}:{int(s):02},{int(round((s % 1) * 1000)):03}"

srt = '\n'.join(f"{i + 1}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text']}\n" for i, c in enumerate(cues))
(VIDEO / 'legendas.srt').write_text(srt, encoding='utf-8')
(TOOLS / 'cues.json').write_text(json.dumps(cues, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(cues), 'legendas')
print(srt[:900])
