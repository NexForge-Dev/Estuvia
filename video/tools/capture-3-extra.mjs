// Etapa 3: quadros extras (início da resposta do Mentor, agenda preenchida, cards do Radar).
import { launch, shot, go, api, demoAccount, BASE } from './lib.mjs';
const acc = demoAccount();
const { browser, page } = await launch();
await page.goto(BASE);
await api(page).post('/auth/login', { email: acc.email, senha: acc.senha });
const jid = (await api(page).get('/journeys')).journeys[0].id;

await go(page, `/j/${jid}/m/2.5`);
await page.locator('.mt-fab').click(); await page.waitForTimeout(900);
const box = page.locator('.mt-drawer textarea, .mt-drawer input[type=text]').first();
await box.fill('Não sei quais documentos preciso preparar. Por onde começo?');
await box.press('Enter');
await page.waitForTimeout(1200);
await shot(page, 'mentor-thinking', { wait: 0 });
await page.waitForTimeout(4000);
// Rola o histórico até a pergunta do estudante para mostrar o começo da resposta.
const info = await page.evaluate(() => {
  const d = document.querySelector('.mt-drawer');
  const el = [...d.querySelectorAll('*')].reverse().find((n) => n.children.length === 0 && /Não sei quais documentos/.test(n.textContent));
  if (!el) return 'pergunta não encontrada';
  el.scrollIntoView({ block: 'start' });
  return el.className;
});
console.log('pergunta:', info);
await shot(page, 'mentor-answer-top', { wait: 600 });

await go(page, '/agenda');
await page.evaluate(() => {
  const label = [...document.querySelectorAll('main *')].find((n) => n.children.length === 0 && n.textContent.trim() === '08:00');
  label?.scrollIntoView({ block: 'start' });
});
await shot(page, 'agenda-filled', { wait: 900 });

await go(page, '/oportunidades');
await page.mouse.move(1000, 500); await page.mouse.wheel(0, 1250); await shot(page, 'radar-c', { wait: 1200 });
await browser.close();
