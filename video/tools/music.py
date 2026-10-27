"""Trilha original do vídeo, sintetizada do zero (sem samples de terceiros: livre para uso comercial).

Am–F–C–G a 100 BPM. Começa só com pad, ganha arpejo, baixo e percussão leve durante a demonstração
e resolve num acorde de Dó maior junto com o logo. Também gera "whooshes" suaves nas trocas de cena.
Saída: assets/audio/trilha.wav (48 kHz, estéreo) e assets/audio/whooshes.wav.
"""
import json, pathlib, wave
import numpy as np

TOOLS = pathlib.Path(__file__).parent
OUT = TOOLS.parent / 'assets' / 'audio'
tl = json.loads((TOOLS / 'timeline.json').read_text(encoding='utf-8'))
SC = {s['id']: s for s in tl['scenes']}
SR = 48000
TOTAL = tl['total']
N = int((TOTAL + 1.0) * SR)
rng = np.random.default_rng(7)

BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
CHORD_LEN = 2 * BAR
mid = lambda m: 440.0 * 2 ** ((m - 69) / 12)
# acordes (notas MIDI): Am, F, C, G — vozes próximas para soar suave
PROG = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 67]]
ROOTS = [45, 41, 48, 43]
FINAL = [48, 55, 60, 62, 64, 67]  # Dó maior com 9ª (resolução)

s = lambda k: SC[k]['start']
T_ARP, T_BASS, T_DRUMS, T_BREAK = s('s2-estuvia'), s('s3-jornada'), s('s5-agenda'), s('s9-final')
T_FINAL = SC['s9-final']['voiceAt'] + SC['s9-final']['voiceDuration'] - 2.6  # acorde final entra antes do "Estuvia"


def env_ad(n, a, d):
    """Envelope ataque-sustentação-queda (amostras)."""
    e = np.ones(n, dtype=np.float32)
    a, d = min(a, n // 2), min(d, n // 2)
    if a: e[:a] = np.linspace(0, 1, a, dtype=np.float32) ** 2
    if d: e[-d:] *= np.linspace(1, 0, d, dtype=np.float32) ** 1.5
    return e


def add(buf, start, sig):
    i = int(start * SR)
    if i >= len(buf): return
    sig = sig[: len(buf) - i]
    buf[i:i + len(sig)] += sig


def curve(points):
    """Automação linear por pontos (tempo, valor) para o vídeo todo."""
    tt = np.arange(N, dtype=np.float32) / SR
    xs, ys = zip(*points)
    return np.interp(tt, xs, ys).astype(np.float32)


def pad_note(freq, dur, detune_cents, harmonics=5):
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    out = np.zeros(n, dtype=np.float32)
    f = freq * 2 ** (detune_cents / 1200)
    vib = 0.0015 * np.sin(2 * np.pi * 0.25 * t)
    for h in range(1, harmonics + 1):
        out += np.sin(2 * np.pi * f * h * t * (1 + vib) + rng.uniform(0, 6.28)).astype(np.float32) / h ** 1.6
    return out * env_ad(n, int(1.4 * SR), int(1.6 * SR))


# ---------- Pad (estéreo, vozes desafinadas para largura) ----------
padL = np.zeros(N, np.float32); padR = np.zeros(N, np.float32)
t0, k = 0.0, 0
while t0 < T_FINAL:
    chord = PROG[k % 4]
    dur = min(CHORD_LEN, T_FINAL - t0) + 1.6
    for m in chord:
        add(padL, t0, pad_note(mid(m), dur, -6) * 0.11)
        add(padR, t0, pad_note(mid(m), dur, +6) * 0.11)
    t0 += CHORD_LEN; k += 1
for m in FINAL:  # resolução final, longa
    d = TOTAL - T_FINAL + 0.8
    add(padL, T_FINAL, pad_note(mid(m), d, -5, 6) * 0.13)
    add(padR, T_FINAL, pad_note(mid(m), d, +5, 6) * 0.13)

# ---------- Arpejo (pluck em colcheias, pan alternado) ----------
arpL = np.zeros(N, np.float32); arpR = np.zeros(N, np.float32)
step = BEAT / 2
pattern = [0, 1, 2, 3, 2, 1, 2, 3]
tt = T_ARP
i = 0
while tt < TOTAL - 1.5:
    k = int(tt // CHORD_LEN) % 4
    if tt >= T_FINAL: chord = [60, 64, 67, 72]
    else: chord = PROG[k]
    m = chord[pattern[i % 8]] + 12
    n = int(0.9 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = mid(m)
    note = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)) * np.exp(-t / 0.22)
    note = note.astype(np.float32) * 0.07 * (0.85 + 0.15 * (i % 2))
    pan = 0.5 + 0.3 * np.sin(i * 0.9)
    add(arpL, tt, note * (1 - pan) * 2); add(arpR, tt, note * pan * 2)
    tt += step; i += 1

# ---------- Baixo (raiz, pulsando em colcheias) ----------
bass = np.zeros(N, np.float32)
tt = T_BASS
while tt < T_FINAL:
    k = int(tt // CHORD_LEN) % 4
    f = mid(ROOTS[k] - 12 + 12)  # A2/F2/C3/G2 uma oitava abaixo do pad
    n = int(step * SR)
    t = np.arange(n, dtype=np.float32) / SR
    note = np.tanh(1.6 * np.sin(2 * np.pi * f * t)) * env_ad(n, int(0.01 * SR), int(0.12 * SR))
    add(bass, tt, note.astype(np.float32) * 0.10)
    tt += step
for f, a in ((mid(36), 0.13),):  # dó grave final
    n = int((TOTAL - T_FINAL) * SR); t = np.arange(n, dtype=np.float32) / SR
    add(bass, T_FINAL, (np.sin(2 * np.pi * f * t) * env_ad(n, int(1.5 * SR), int(3 * SR)) * a).astype(np.float32))

# ---------- Percussão leve ----------
drums = np.zeros(N, np.float32)
duck = np.ones(N, np.float32)
def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 45 + 75 * np.exp(-t / 0.035)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)).astype(np.float32)
def hat(decay=0.03):
    n = int(0.12 * SR); t = np.arange(n) / SR
    x = np.diff(rng.standard_normal(n + 1)).astype(np.float32)
    return x * np.exp(-t / decay).astype(np.float32)
def clap():
    n = int(0.25 * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n).astype(np.float32)
    x = np.diff(np.concatenate([[0], x])).astype(np.float32)
    return x * (np.exp(-t / 0.07) * (1 + 0.6 * (np.sin(2 * np.pi * 90 * t) > 0))).astype(np.float32)
K, H, C = kick(), hat(), clap()
beat = 0
tt = T_BASS
while tt < T_BREAK - 0.05:
    full = tt >= T_DRUMS
    add(drums, tt + BEAT / 2, H * (0.035 if full else 0.025))           # contratempo
    if full:
        add(drums, tt, K * 0.30)
        d = int(tt * SR); L = int(0.28 * SR)
        duck[d:d + L] = np.minimum(duck[d:d + L], 1 - 0.35 * np.exp(-np.arange(L) / (0.09 * SR)))
        if beat % 4 in (1, 3): add(drums, tt, C * 0.045)
        add(drums, tt + BEAT * 0.75, H * 0.018)
    tt += BEAT; beat += 1

# ---------- Reverb (convolução com resposta sintética, overlap-add) ----------
def reverb(x, seed, seconds=2.6):
    r = np.random.default_rng(seed)
    n = int(seconds * SR); t = np.arange(n) / SR
    ir = (r.standard_normal(n) * np.exp(-t / 0.75)).astype(np.float32)
    ir[: int(0.012 * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    B = 1 << 19; F = 1 << 20
    IR = np.fft.rfft(ir, F)
    y = np.zeros(len(x) + n, np.float32)
    for i in range(0, len(x), B):
        seg = x[i:i + B]
        out = np.fft.irfft(np.fft.rfft(seg, F) * IR, F)[: len(seg) + n - 1].astype(np.float32)
        y[i:i + len(out)] += out[: len(y) - i]
    return y[: len(x)]

wetL = reverb(padL * 0.6 + arpL, 1); wetR = reverb(padR * 0.6 + arpR, 2)

# ---------- Mixagem com automação de energia ----------
s1, s2, s3, s5, s9 = 0, T_ARP, T_BASS, T_DRUMS, T_BREAK
pad_g = curve([(0, 0), (3, 0.7), (s2, 0.8), (s3, 0.85), (s5, 0.75), (s9, 0.85), (TOTAL - 1.5, 1.0), (TOTAL + 1, 0)])
arp_g = curve([(0, 0), (s2, 0), (s2 + 3, 0.6), (s3, 0.8), (s5, 1.0), (s9, 0.9), (T_FINAL, 0.7), (TOTAL - 2, 0.2), (TOTAL + 1, 0)])
L = (padL * pad_g + arpL * arp_g) * duck + bass * duck + drums + wetL * 0.55 * pad_g
R = (padR * pad_g + arpR * arp_g) * duck + bass * duck + drums + wetR * 0.55 * pad_g
master = curve([(0, 0), (1.5, 1), (TOTAL - 2.5, 1), (TOTAL, 0), (TOTAL + 1, 0)])
L *= master; R *= master
mix = np.stack([L, R], axis=1)[: int(TOTAL * SR)]
mix = np.tanh(mix * 1.2) / 1.2
mix *= 0.89 / np.max(np.abs(mix))


def write(path, data):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(data, -1, 1) * 32767).astype('<i2').tobytes())


write(OUT / 'trilha.wav', mix)

# ---------- Whooshes nas trocas de cena ----------
wh = np.zeros((int(TOTAL * SR), 2), np.float32)
for sc in tl['scenes'][1:]:
    n = int(1.4 * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n).astype(np.float32)
    # filtro passa-banda simples: média móvel de tamanho variável (abre o brilho até o corte)
    y = np.empty_like(x); acc = 0.0
    a = np.linspace(0.02, 0.35, n) ** 1.5
    for j in range(n):
        acc += a[j] * (x[j] - acc); y[j] = acc
    e = np.sin(np.pi * np.clip(t / 1.4, 0, 1)) ** 3
    y = (y * e).astype(np.float32) * 0.18
    i = int((sc['start'] - 0.9) * SR)
    pan = np.linspace(0.2, 0.8, n)
    wh[i:i + n, 0] += y * (1 - pan); wh[i:i + n, 1] += y * pan
write(OUT / 'whooshes.wav', wh)
print('trilha.wav e whooshes.wav gerados:', round(TOTAL, 2), 's')
