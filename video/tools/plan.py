"""Linha do tempo do vídeo: duração de cada cena a partir da narração gravada.

Saída: tools/timeline.json (usada pela trilha, legendas, composição e montagem final).
"""
import json, pathlib

TOOLS = pathlib.Path(__file__).parent
AUDIO = TOOLS.parent / 'assets' / 'audio'
script = json.loads((TOOLS / 'script.json').read_text(encoding='utf-8'))

LEAD = {'s1-sonho': 1.2}       # atraso da voz no início da cena (s)
TAIL = {'s1-sonho': 0.6, 's9-final': 3.4}       # tempo depois da voz (logo final)
t = 0.0
scenes = []
for s in script['scenes']:
    words = json.loads((AUDIO / f"{s['id']}.words.json").read_text(encoding='utf-8'))
    lead = LEAD.get(s['id'], 0.6)
    dur = max(s['min'], lead + words['duration'] + TAIL.get(s['id'], 0.6))
    scenes.append({'id': s['id'], 'title': s['title'], 'start': round(t, 3), 'duration': round(dur, 3),
                   'voiceAt': round(t + lead, 3), 'voiceDuration': words['duration'], 'onscreen': s['onscreen']})
    t += dur
timeline = {'fps': 30, 'width': 1920, 'height': 1080, 'total': round(t, 3), 'scenes': scenes}
(TOOLS / 'timeline.json').write_text(json.dumps(timeline, ensure_ascii=False, indent=1), encoding='utf-8')
for s in scenes:
    print(f"{s['id']:<15} {s['start']:7.2f}  dur {s['duration']:5.2f}  voz {s['voiceDuration']:5.2f}")
print('total', round(t, 2))
