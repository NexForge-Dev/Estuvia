// Página pública: o que é a Estuvia, como funciona e o que ela não faz.
import { h, tag } from '../ui.js';
import { icon } from '../icons.js';
import { state } from '../app.js';

export function landingView() {
  const rounds = state.content.rounds.filter((r) => !r.transversal);
  const logged = Boolean(state.me);
  const feature = (ic, title, text) => h('div', { class: 'feature' }, h('span', { class: 'feature-icon' }, icon(ic, { size: 22 })), h('h3', {}, title), h('p', {}, text));
  return h('div', { class: 'landing stack-lg' },
    h('section', { class: 'landing-hero' },
      h('img', { class: 'jh-bg', src: '/img/cities/granada.svg', alt: '' }),
      h('div', { class: 'landing-hero-content' },
        h('p', { class: 'eyebrow' }, 'Mestrado oficial na Espanha · começando por Granada'),
        h('h1', {}, 'Não é um guia. ', h('span', { class: 'accent' }, 'É a sua jornada, missão por missão.')),
        h('p', { class: 'lead' }, 'A Estuvia transforma o processo real — escolher o mestrado, candidatar-se no DUA, financiar, tirar o visto, mudar e se regularizar — em rodadas e missões que você executa, com prazos, documentos, Agenda AI e um mentor de IA.'),
        h('div', { class: 'row wrap' },
          h('a', { href: logged ? '#/' : '#/cadastro', class: 'btn btn-cta btn-lg' }, logged ? 'Ir para o meu painel' : 'Começar grátis', icon('arrow', { size: 16 })),
          logged ? h('a', { href: '#/manual', class: 'btn btn-ghost btn-lg' }, 'Manual de referência') : h('a', { href: '#/entrar', class: 'btn btn-ghost btn-lg' }, 'Já tenho conta')))),
    h('section', { class: 'grid-3' },
      feature('map', 'Jornada visual', 'Rodadas em cards e uma trilha de missões em zigue-zague, com dependências reais e missões paralelas.'),
      feature('target', 'Missões executáveis', 'Cada missão é uma central: briefing, guia, documentos, fluxo, prazos, execução e confirmação.'),
      feature('euro', 'Como vou me financiar?', 'Separa a comprovação do visto do orçamento real e sugere caminhos: bolsas, apoio familiar, outro destino ou período.'),
      feature('calendar', 'Agenda AI', 'Organiza sua semana com as missões certas, respeita seus horários e replaneja quando algo muda.'),
      feature('sparkles', 'Mentor IA', 'Conhece sua jornada, prazos e finanças. Cita fontes e não inventa requisitos.'),
      feature('home2', 'Mudança organizada', '"Meu novo lar" com checklist antifraude, comparação de rotas e chegada planejada.')),
    h('section', { class: 'panel' }, h('h2', {}, '8 rodadas até a sua estadia regularizada'),
      h('div', { class: 'landing-rounds' }, rounds.map((r) => h('div', { class: 'lr' }, h('img', { src: r.banner, alt: '' }), h('div', {}, h('small', {}, `Rodada ${r.numero}`), h('strong', {}, r.titulo))))),
      h('p', { class: 'muted small' }, 'As rodadas são desbloqueadas conforme você avança. Crie sua conta para começar pela Rodada 1. ', '+ Trilha transversal "Como vou financiar meus estudos?", que começa na Rodada 1 e segue até o visto.')),
    h('section', { class: 'grid-2' },
      h('div', { class: 'panel' }, h('h2', {}, 'Confiança em primeiro lugar'),
        h('ul', { class: 'tag-legend' },
          h('li', {}, tag('verificado'), ' Regra conferida em norma ou página oficial, com data de revisão.'),
          h('li', {}, tag('pratica'), ' Sugestão de quem já passou pelo processo.'),
          h('li', {}, tag('estimativa'), ' Valor calculado com premissas explícitas.'),
          h('li', {}, tag('pendente'), ' Depende do curso, consulado, ano ou da sua situação.'))),
      h('div', { class: 'panel' }, h('h2', {}, 'O que a Estuvia não faz'),
        h('ul', {},
          h('li', {}, 'Não envia candidaturas nem pedidos oficiais em seu nome.'),
          h('li', {}, 'Não garante admissão, bolsa nem visto.'),
          h('li', {}, 'Não marca missões como concluídas sem a sua confirmação.'),
          h('li', {}, 'Não envia seus documentos ao servidor: anexos ficam no seu dispositivo.')))),
  );
}
