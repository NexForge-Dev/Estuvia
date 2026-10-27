# Vídeo de apresentação da Estuvia

| Arquivo | O que é |
|---|---|
| `estuvia-apresentacao.mp4` | Vídeo final em inglês, 1:27 (1920×1080, 30 fps, H.264 + AAC 256 kbps, legendas gravadas na imagem). A landing usa uma cópia de 720p em `public/video/` |
| `narracao.txt` | Roteiro definitivo da locução (inglês), com os tempos de cada cena |
| `legendas.srt` | Legendas sincronizadas palavra a palavra com a narração |
| `storyboard.md` | Cenas, tempos, visuais e cuidados de fidelidade ao produto |
| `assets/screens/` | Capturas reais do app (conta de demonstração fictícia) |
| `assets/audio/` | Narração por cena (`.mp3` + tempos das palavras). Os `.wav` (narração 48 kHz, `trilha.wav`, `whooshes.wav`) são regenerados por `tts.py` e `music.py` e ficam fora do git |
| `assets/brand/` | Logo copiado de `public/img` |
| `composition/` | A composição do vídeo em HTML/CSS/JS: `renderAt(t)` desenha cada quadro |
| `tools/` | Scripts de produção (captura, voz, trilha, legendas, renderização) |

## Licenças e voz

- **Trilha:** composta e sintetizada do zero por `tools/music.py`, sem samples de terceiros. Pode ser usada comercialmente.
- **Narração:** voz neural `en-US-AvaNeural` gerada com `edge-tts`, que usa o serviço de leitura do Microsoft Edge. Os termos desse serviço para uso comercial não são claros. Para o lançamento oficial, substitua por locução humana ou por um TTS com licença comercial (veja "Trocar a voz").
- **Imagens:** todas são telas do próprio app e o logo da plataforma.

## Como regenerar

Requisitos: Node 20+, Python 3.11+, Google Chrome instalado.

```bash
cd video/tools
npm install                                   # playwright-core (usa o Chrome instalado) e ffmpeg-static
python -m venv .venv && .venv/Scripts/python -m pip install edge-tts numpy

# 1. Servidor de demonstração separado (não toca em data/db.json)
#    (na raiz do projeto)  PORT=3100 DATA_FILE=video/tools/demo-data/db.json ADMIN_EMAIL= node server/index.js

# 2. Conta fictícia e dados (só na primeira vez)
node capture-1-onboarding.mjs                 # landing, cadastro e onboarding reais
node seed-progress.mjs 1.1 1.2 1.3 1.4        # conclui missões pela API real
node seed-data.mjs                            # finanças, moradia, viagem, documentos, comunidade (fictícios)
node seed-progress.mjs 1.5

# 3. Telas
node capture-2-app.mjs && node capture-3-extra.mjs && node capture-4-chegada.mjs

# 4. Áudio, tempos e legendas
.venv/Scripts/python tts.py                   # narração por cena (script.json)
.venv/Scripts/python plan.py                  # timeline.json (duração das cenas a partir da voz)
.venv/Scripts/python music.py                 # trilha.wav + whooshes.wav
.venv/Scripts/python subs.py                  # legendas.srt + cues.json

# 5. Vídeo
node render.mjs --stills 10,45,90             # prévias em tools/tmp/
node render.mjs                               # estuvia-apresentacao.mp4 (~4 min)
node render.mjs --mux                         # refaz só o áudio sobre o vídeo já renderizado
```

**Trocar o idioma ou editar a narração:** altere `tools/script.json` (texto e voz) e rode de novo a partir do passo 4.
**Ajustar câmera, etiquetas e tempos de cada cena:** `composition/comp.js`, função `buildScenes()`. Os tempos seguem as palavras da narração (`w(cena, 'palavra')`): ao trocar o roteiro, atualize as palavras de referência. As coordenadas sobre as telas são normalizadas (0–1).

## Trocar a voz

Grave cada cena seguindo `narracao.txt` e salve com o mesmo nome em `assets/audio/` (`s1-sonho.wav`, `s2-estuvia.wav`…, 48 kHz estéreo; os nomes das cenas ficaram em português), por cima dos arquivos gerados. Não rode `tts.py` de novo, porque ele sobrescreve os `.wav`. Atualize `duration` em `*.words.json` com a duração da gravação e ajuste os tempos das palavras, se quiser legendas exatas. Depois rode `plan.py`, `music.py`, `subs.py` e `render.mjs`. A mixagem abaixa a trilha automaticamente sob a voz (sidechain).
