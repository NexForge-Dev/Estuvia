// Catálogo de conquistas. Conteúdo puro: cada conquista declara QUAL fato a libera;
// a avaliação vive em server/achievements-engine.js (regra com o mesmo id em RULES).
//
// Campos: id, titulo, descricao (o que significa), comoGanhar (o que fazer), icone (public/js/icons.js),
//   categoria (CATEGORIES), nivel (bronze|prata|ouro), meta (opcional: conquista com contador)

export const CATEGORIES = {
  inicio: 'Primeiros passos',
  candidatura: 'Candidatura e vaga',
  visto: 'Visto e finanças',
  mudanca: 'Mudança e chegada',
};

export const LEVEL_POINTS = { bronze: 10, prata: 25, ouro: 50 };

export const ACHIEVEMENTS = [
  // ---------- Primeiros passos ----------
  { id: 'primeiro-passo', categoria: 'inicio', nivel: 'bronze', icone: 'compass', titulo: 'Primeiro passo',
    descricao: 'Você decidiu atravessar.', comoGanhar: 'Crie sua primeira jornada.' },
  { id: 'perfil-completo', categoria: 'inicio', nivel: 'bronze', icone: 'user', titulo: 'Quem sou eu',
    descricao: 'Perfil pronto para receber orientação sob medida.', comoGanhar: 'Preencha nacionalidade, país de residência, formação e nível de espanhol no perfil.' },
  { id: 'primeira-missao', categoria: 'inicio', nivel: 'bronze', icone: 'check', titulo: 'Mão na massa',
    descricao: 'A primeira missão ninguém esquece.', comoGanhar: 'Conclua qualquer missão.' },
  { id: 'dez-missoes', categoria: 'inicio', nivel: 'prata', icone: 'target', titulo: 'Ritmo de viagem', meta: 10,
    descricao: 'Constância é o que faz a vaga chegar.', comoGanhar: 'Conclua 10 missões (somando todas as jornadas).' },
  { id: 'primeira-rodada', categoria: 'inicio', nivel: 'prata', icone: 'trophy', titulo: 'Rodada fechada',
    descricao: 'Uma etapa inteira para trás.', comoGanhar: 'Conclua todas as missões de uma rodada da jornada principal.' },
  { id: 'plano-b', categoria: 'inicio', nivel: 'bronze', icone: 'map', titulo: 'Plano B',
    descricao: 'Mais de um caminho aumenta suas chances de ter opções.', comoGanhar: 'Tenha duas ou mais jornadas ativas.' },

  // ---------- Candidatura e vaga ----------
  { id: 'docs-prontos', categoria: 'candidatura', nivel: 'bronze', icone: 'folder', titulo: 'Papelada em dia',
    descricao: 'Os documentos-base da candidatura estão prontos.', comoGanhar: 'Marque passaporte, diploma e histórico como "Pronto", "Enviado" ou "Não se aplica" em Documentos.' },
  { id: 'candidatura-enviada', categoria: 'candidatura', nivel: 'prata', icone: 'send', titulo: 'Candidatura enviada',
    descricao: 'Sua candidatura está nas mãos do DUA.', comoGanhar: 'Conclua a missão de envio ou registre a candidatura como enviada na situação da jornada.' },
  { id: 'admitido', categoria: 'candidatura', nivel: 'ouro', icone: 'sparkles', titulo: 'Aprovado(a)!',
    descricao: 'Você foi admitido(a) no mestrado.', comoGanhar: 'Registre "Admitido(a)" na situação da adjudicação.' },
  { id: 'vaga-garantida', categoria: 'candidatura', nivel: 'ouro', icone: 'flag', titulo: 'Vaga garantida',
    descricao: 'A vaga é sua: confirmada ou reservada.', comoGanhar: 'Registre a vaga como confirmada ou reservada (ou conclua a missão da vaga).' },
  { id: 'matriculado', categoria: 'candidatura', nivel: 'ouro', icone: 'cap', titulo: 'Matrícula feita',
    descricao: 'Oficialmente estudante na Espanha.', comoGanhar: 'Registre a matrícula como efetivada (ou conclua a missão de matrícula).' },

  // ---------- Visto e finanças ----------
  { id: 'plano-viavel', categoria: 'visto', nivel: 'prata', icone: 'euro', titulo: 'Contas fechadas',
    descricao: 'Seus recursos cobrem a exigência do visto e o orçamento.', comoGanhar: 'Informe custos e recursos no planejador até o plano ficar viável.' },
  { id: 'bolsa-concedida', categoria: 'visto', nivel: 'ouro', icone: 'wand', titulo: 'Bolsista',
    descricao: 'Uma bolsa aprovada para a sua travessia.', comoGanhar: 'Registre uma candidatura a bolsa como "concedida".' },
  { id: 'visto-aprovado', categoria: 'visto', nivel: 'ouro', icone: 'passport', titulo: 'Visto aprovado',
    descricao: 'O consulado disse sim.', comoGanhar: 'Registre o visto como "Aprovado" na situação da jornada (ou conclua a missão de conferência do visto).' },

  // ---------- Mudança e chegada ----------
  { id: 'lar-escolhido', categoria: 'mudanca', nivel: 'prata', icone: 'home', titulo: 'Lar à vista',
    descricao: 'Você já sabe onde vai morar.', comoGanhar: 'Marque uma opção como escolhida em "Meu novo lar".' },
  { id: 'rota-tracada', categoria: 'mudanca', nivel: 'prata', icone: 'plane', titulo: 'Rota traçada',
    descricao: 'O caminho até a Espanha está definido.', comoGanhar: 'Escolha uma rota no planejamento de viagem.' },
  { id: 'chegou', categoria: 'mudanca', nivel: 'ouro', icone: 'pin', titulo: 'Cheguei!',
    descricao: 'Pés na Andaluzia.', comoGanhar: 'Registre sua data de entrada na Espanha.' },
  { id: 'residente', categoria: 'mudanca', nivel: 'ouro', icone: 'shield', titulo: 'Residente',
    descricao: 'Estadia regularizada com a TIE.', comoGanhar: 'Conclua a missão de retirada da TIE.' },
  { id: 'travessia-completa', categoria: 'mudanca', nivel: 'ouro', icone: 'globe', titulo: 'Travessia completa',
    descricao: 'Todas as missões de uma jornada concluídas.', comoGanhar: 'Chegue a 100% em uma jornada.' },
];
