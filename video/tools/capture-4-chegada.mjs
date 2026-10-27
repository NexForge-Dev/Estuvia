// Etapa 4: telas de chegada (rodadas finais e chegada na Viagem).
import { launch, shot, go, api, demoAccount, BASE } from './lib.mjs';
const acc = demoAccount();
const { browser, page } = await launch();
await page.goto(BASE);
await api(page).post('/auth/login', { email: acc.email, senha: acc.senha });
const jid = (await api(page).get('/journeys')).journeys[0].id;
const scroll = async (y) => { await page.mouse.move(1000, 500); await page.mouse.wheel(0, y); await page.waitForTimeout(800); };
await go(page, `/j/${jid}`); await scroll(1500); await shot(page, 'rounds-c', { wait: 1200 });
await go(page, '/viagem'); await scroll(2600); await shot(page, 'travel-d', { wait: 1000 }); await scroll(900); await shot(page, 'travel-e', { wait: 1000 });
const txt = await page.locator('main').innerText(); console.log(txt.slice(txt.indexOf('Chegada') - 200, txt.indexOf('Chegada') + 600));
await browser.close();
