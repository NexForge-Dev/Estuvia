// Etapa 2: telas reais do app com a conta de demonstração já preenchida.
// Uso: node capture-2-app.mjs [nomes...]  (sem argumentos captura tudo)
import { launch, shot, go, api, demoAccount, BASE } from './lib.mjs';

const acc = demoAccount();
const { browser, page } = await launch();
await page.goto(BASE);
await api(page).post('/auth/login', { email: acc.email, senha: acc.senha });
const jid = (await api(page).get('/journeys')).journeys[0].id;
const only = new Set(process.argv.slice(2));
const want = (n) => !only.size || only.has(n);
const scroll = async (y) => { await page.mouse.move(1000, 500); await page.mouse.wheel(0, y); await page.waitForTimeout(700); };
const clickText = async (re) => { await page.getByRole('button', { name: re }).first().click(); await page.waitForTimeout(900); };

if (want('home')) { await go(page, '/'); await shot(page, 'home', { wait: 1500 }); await scroll(700); await shot(page, 'home-b'); }
if (want('journeys')) { await go(page, '/jornadas'); await shot(page, 'journeys', { wait: 1200 }); }
if (want('rounds')) { await go(page, `/j/${jid}`); await shot(page, 'rounds', { wait: 1500 }); await scroll(700); await shot(page, 'rounds-b'); }
if (want('trail')) { await go(page, `/j/${jid}/r/2`); await shot(page, 'trail', { wait: 1500 }); await scroll(500); await shot(page, 'trail-b'); }
if (want('mission')) {
  await go(page, `/j/${jid}/m/2.5`); await shot(page, 'mission', { wait: 1500 });
  await scroll(800); await shot(page, 'mission-b'); await scroll(900); await shot(page, 'mission-c');
}
if (want('mentor')) {
  await go(page, `/j/${jid}/m/2.5`);
  await page.locator('.mt-fab').click(); await page.waitForTimeout(1000);
  await shot(page, 'mentor-open');
  const box = page.locator('.mt-drawer textarea, .mt-drawer input[type=text]').first();
  await box.fill('Não sei quais documentos preciso preparar. Por onde começo?');
  await shot(page, 'mentor-typed', { wait: 300 });
  await box.press('Enter');
  await page.waitForTimeout(5000);
  await shot(page, 'mentor-answer');
  const drawer = page.locator('.mt-drawer');
  console.log((await drawer.innerText()).slice(0, 2500));
}
if (want('agenda')) {
  await go(page, '/agenda'); await shot(page, 'agenda', { wait: 1500 });
  await clickText(/Organizar com IA/);
  await shot(page, 'agenda-suggest', { wait: 1500 });
  console.log((await page.locator('dialog[open], .modal, .sheet, [role=dialog]').first().innerText().catch(() => 'sem diálogo')).slice(0, 900));
  console.log('botões:', (await page.getByRole('button').allInnerTexts()).filter(Boolean).slice(0, 40).join(' | '));
  const ok = page.getByRole('button', { name: /Aprovar|Adicionar à agenda|Confirmar/ });
  if (await ok.count()) { await ok.first().click(); await page.waitForTimeout(1500); await shot(page, 'agenda-approved', { wait: 1200 }); }
}
if (want('finance')) { await go(page, '/financiamento'); await shot(page, 'finance', { wait: 1800 }); await scroll(800); await shot(page, 'finance-b'); await scroll(900); await shot(page, 'finance-c'); }
if (want('documents')) { await go(page, '/documentos'); await shot(page, 'documents', { wait: 1500 }); await scroll(800); await shot(page, 'documents-b'); }
if (want('housing')) { await go(page, '/novo-lar'); await shot(page, 'housing', { wait: 1500 }); await scroll(800); await shot(page, 'housing-b'); }
if (want('travel')) { await go(page, '/viagem'); await shot(page, 'travel', { wait: 1500 }); await scroll(800); await shot(page, 'travel-b'); await scroll(900); await shot(page, 'travel-c'); }
if (want('radar')) { await go(page, '/oportunidades'); await shot(page, 'radar', { wait: 2000 }); await scroll(700); await shot(page, 'radar-b'); }
if (want('community')) { await go(page, '/comunidade'); await shot(page, 'community', { wait: 1500 }); await scroll(600); await shot(page, 'community-b'); }
if (want('catalog')) { await go(page, '/mestrados'); await shot(page, 'catalog', { wait: 1500 }); }
if (want('achievements')) { await go(page, '/conquistas'); await shot(page, 'achievements', { wait: 1500 }); }
await browser.close();
