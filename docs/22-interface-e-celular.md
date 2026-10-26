# 22 — Interface: visual minimalista, navegação e celular

A regra visual: **menos coisa na tela, mesma informação disponível.** Nada foi removido do produto. O que é secundário fica um toque mais longe, e o visual é plano e calmo para o conteúdo aparecer.

## 1. Arquivos

| Arquivo | Papel |
|---|---|
| `public/css/styles.css` | Design system base (tokens, componentes). Não foi reescrito |
| `public/css/minimal.css` | **Camada minimalista + regras de celular.** Carregada por último no `index.html` |
| `public/js/app.js` | `NAV`, `NAV_MORE` e `renderNav()`: menu lateral, seção "Mais" e barra inferior |
| `public/index.html` | `<nav id="tabbar">` e `viewport-fit=cover` (áreas seguras do iPhone) |
| `public/js/icons.js` | Ícone `menu` (usado na barra inferior) |
| `public/js/views/home.js` | Início com menos painéis |

## 2. Camada minimalista (`minimal.css`)

- **Por que uma camada separada:** o visual muda sem tocar nos 12 CSS dos módulos. Para voltar ao visual anterior, basta remover o `<link>` de `minimal.css` do `index.html`.
- **Seletores com `html` na frente** (`html .btn`): ganham dos CSS carregados sob demanda (mentor, comunidade, viagem, documentos, central da missão, resultados), que entram no `<head>` depois.
- **O que muda:**

  | Item | Antes | Agora |
  |---|---|---|
  | Sombras | `--shadow` em cards, modais, toasts | Nenhuma (`box-shadow: none`) |
  | Gradientes | Botão principal, barras, cards em destaque | Cor sólida (`--accent`) |
  | Cantos | 18–26px | 8–14px (`--radius: 12px`) |
  | Fundos | Vários tons (`--bg`, `--bg-2`, superfícies) | Fundo único, superfícies próximas |
  | Fontes | Pesos 750–900 | Pesos 500–700 |
  | Movimento | Missão atual pulsando, entrada de página .28s | Sem pulso, entrada .15s |

- **Tokens preservados:** cores de estado (`--ok`, `--warn`, `--danger`, `--info`…) e as cores de destaque escolhidas no perfil (`data-accent`) continuam valendo. Os temas claro e escuro também.
- **Imagens dos heróis** (início, jornada, landing) mantêm o escurecimento por cima: ele garante a leitura do texto branco.

## 3. Navegação

| Onde | Itens |
|---|---|
| Menu principal (`NAV`) | Início · Minha jornada · Agenda · Documentos · Financiamento |
| "Mais" (`NAV_MORE`, recolhível) | Meu novo lar · Viagem · Mestrados · Oportunidades · Comunidade · Conquistas · Mentor IA · Manual |
| Barra inferior (celular) | Os 4 primeiros de `NAV` + **Menu** (abre a lateral completa) |

- "Mais" abre sozinho quando a tela atual está nele e lembra se você o abriu.
- Para mover uma tela para o menu principal, basta movê-la de `NAV_MORE` para `NAV`. A barra inferior usa sempre `NAV.slice(0, 4)`.
- As rotas não mudaram: links antigos (`#/viagem`, `#/conquistas`…) continuam funcionando.
- Sem login, o menu mostra só Início, Entrar e Criar conta, e a barra inferior não aparece.

## 4. Início

Ficou: herói com destino, progresso e "Continuar missão" · até **3** alertas (antes 6) · rodada atual · Agenda AI · prazos · situação financeira · outras jornadas.

Saiu: o painel "Meu assistente" (o botão flutuante do Mentor já faz isso) e o texto longo sob o painel financeiro (a explicação continua em Financiamento).

## 5. Celular

Pontos de quebra: **960px** (menu vira gaveta, aparece a barra inferior) e **640px** (ajustes de tela pequena).

| Até 960px | Até 640px |
|---|---|
| Barra inferior fixa, com área segura do iPhone (`env(safe-area-inset-bottom)`) | Campos com **16px** (o iPhone não dá zoom ao tocar) e 44px de altura |
| Botão do Mentor, toasts e botão fixo de missão sobem acima da barra | Botões com no mínimo 44px; `btn-lg` ocupa a largura toda |
| Hambúrguer do topo some (a barra tem "Menu") | Heróis em coluna: anel de 84px no topo, texto embaixo |
| Gaveta lateral esconde a barra quando aberta | Alertas em 1 coluna; números do financeiro em 2 |
| | Mentor flutuante só com ícone |
| | Modais e painéis abrem de baixo, com largura total |
| | Margens laterais de 16px e sem rolagem horizontal (`overflow-x: clip`) |

Os CSS dos módulos já tinham regras próprias de celular (comunidade, documentos, finanças, moradia, mentor, central da missão, radar, resultados, viagem). Elas continuam valendo.

## 6. Para telas novas

1. Use os componentes existentes (`.panel`, `.btn`, `.chip`, `.field`). Não crie sombras nem gradientes.
2. Uma ação principal por tela (`btn-cta`). As outras ficam `btn-ghost`.
3. Grades com `repeat(auto-fit, minmax(…px, 1fr))` com mínimo de até 260px (cabe em 320px de tela).
4. Tabelas dentro de `.table-wrap` (rolagem horizontal).
5. Textos longos em "Entender melhor" (`<details>`), não abertos na tela.
6. Teste em 360px de largura: nenhum elemento pode passar da tela nem ficar sob a barra inferior.

## 7. Como testar no celular

- **No computador:** F12 → Ctrl+Shift+M (modo dispositivo) → escolha um iPhone ou um Android de 360px.
- **No aparelho:** com o servidor rodando, abra `http://<IP do computador>:3000` na mesma rede Wi-Fi.
- **Conferir:** barra inferior, "Menu" abrindo a lateral, Mentor acima da barra, campos sem zoom, nada cortado na lateral.

## 8. Pendências

- Não houve conferência visual em navegador durante a implementação: faça o teste da seção 7.
- Telas muito densas (missão, financiamento) ainda podem ser simplificadas no conteúdo, não só no visual.
- Instalar como app (PWA, ícone na tela inicial) ainda não existe.
