// Tela da missão: central da missão (MissionHub, cards por complexidade) com o guia passo a passo como
// ferramenta principal; missão bloqueada mostra só a prévia. Cada mutação devolve missão + jornada +
// eventos de feedback, calculados no servidor; a tela é redesenhada mantendo o passo em foco.
import { h, mount, toast } from '../ui.js';
import { api } from '../api.js';
import { state, loadJourney, cacheJourney, setMe, invalidate, checkAchievements } from '../app.js';
import { LockedMission } from '../components/MissionGuide.js';
import { MissionHub } from '../components/mission-hub/MissionHub.js';
import { openAssistant } from '../components/AIJourneyAssistant.js';
import { showEvents } from '../components/common.js';

const CATEGORY_BY_ROUND = { 1: 'academico', 2: 'documentacao', 3: 'academico', 4: 'financeiro', 5: 'visto', 6: 'viagem', 7: 'pessoal', 8: 'documentacao', 9: 'financeiro' };

export async function missionView(jid, mid) {
  let journey = await loadJourney(jid, { fresh: true });
  let mission = (await api.get(`/journeys/${jid}/missions/${mid}`)).mission;
  const root = h('div', { class: 'mission-page' });

  const draw = () => {
    const scrollY = window.scrollY;
    mount(root, mission.bloqueada
      ? LockedMission(mission, journey, { onArrival: (r) => { cacheJourney(r.journey); showEvents(r.events || []); ctx.reload(); } })
      : MissionHub(mission, ctx));
    if (ctx.state.moreOpen) ctx.reopen?.();
    window.scrollTo(0, scrollY);
  };

  let mutSeq = 0;
  const ctx = {
    api,
    state: { open: null },
    get journey() { return journey; },
    userId: state.me.user.id,
    categoryForRound: (n) => CATEGORY_BY_ROUND[n] || 'pessoal',
    openAssistant,
    redraw: () => draw(),
    // Uma alteração por vez: a tela fica ocupada até a resposta (clique duplo não dessincroniza) e
    // respostas antigas são ignoradas. Conflito (409, outra aba já mudou): recarrega do servidor.
    async mutate(promise) {
      const my = ++mutSeq;
      root.classList.add('is-busy'); root.setAttribute('aria-busy', 'true');
      try {
        const r = await promise;
        if (my !== mutSeq) return;
        if (r.journey) { journey = r.journey; cacheJourney(r.journey); }
        mission = r.mission || (await api.get(`/journeys/${jid}/missions/${mid}`)).mission;
        if (r.events?.some((e) => e.tipo === 'missao-concluida')) ctx.state.open = null;
        draw();
        showEvents(r.events || []);
      } catch (e) {
        toast(e.message, 'err');
        if (e.status === 409 && my === mutSeq) await ctx.reload().catch(() => {});
      } finally {
        if (my === mutSeq) { root.classList.remove('is-busy'); root.removeAttribute('aria-busy'); }
      }
    },
    async saveDoc(id, status) {
      setMe(await api.put('/me/documents', { [id]: status }));
      await ctx.reload();
    },
    async reload() {
      invalidate();
      journey = await loadJourney(jid, { fresh: true });
      mission = (await api.get(`/journeys/${jid}/missions/${mid}`)).mission;
      draw();
      checkAchievements();
    },
  };

  draw();
  return root;
}
