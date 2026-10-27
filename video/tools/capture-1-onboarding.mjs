// Etapa 1: landing, cadastro e onboarding reais da conta de demonstração.
import { launch, shot, go, demoAccount } from './lib.mjs';

const acc = demoAccount();
const { browser, page } = await launch();

await go(page, '/');
await shot(page, 'landing-hero', { wait: 1500 });
await page.mouse.wheel(0, 1900); await shot(page, 'landing-rounds', { wait: 1500 });

await go(page, '/cadastro');
await shot(page, 'signup-empty');
await page.fill('input[name=nome]', acc.nome);
await page.fill('input[name=email]', acc.email);
await page.fill('input[name=senha]', acc.senha);
await page.check('input[name=aceite]');
await shot(page, 'signup-filled');
await page.click('button[type=submit]');
await page.waitForTimeout(2000);
if (!page.url().includes('onboarding') && (await page.locator('input[name=nome]').count())) {
  // Conta já existe (nova execução): entra com ela.
  await go(page, '/entrar');
  await page.fill('input[name=email]', acc.email);
  await page.fill('input[name=senha]', acc.senha);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2000);
  await go(page, '/jornadas/nova');
}
console.log('url:', page.url());

// O onboarding redesenha no "change": preenche, dispara o change e espera o novo DOM.
const type = async (n, v) => { await page.fill(`input[name=${n}]`, v); await page.locator(`input[name=${n}]`).dispatchEvent('change'); await page.waitForTimeout(150); };
const setSel = async (n, v) => { await page.selectOption(`select[name=${n}]`, v); await page.waitForTimeout(150); };
const next = async (name) => { await shot(page, name, { wait: 700 }); await page.getByRole('button', { name: /^(Continuar|Gerar minha jornada)/ }).click(); await page.waitForTimeout(700); };

await setSel('estado', 'BA');
await next('ob-1-origem');
await type('formacao', 'Ciência da Computação');
await type('instituicao', 'Universidade Federal da Bahia');
await type('area', 'Tecnologia e Ciência de Dados');
await next('ob-2-formacao');
await setSel('espanhol', 'B2'); await setSel('ingles', 'C1');
await next('ob-3-idiomas');
await type('orcamentoDisponivel', '9000');
await next('ob-4-orcamento');
await page.getByText('Mestrado em Ciências — exemplo C').click();
await page.waitForTimeout(400);
await shot(page, 'ob-5-destino');
await page.mouse.wheel(0, 600); await shot(page, 'ob-5-destino-b');
await page.getByRole('button', { name: /^Continuar/ }).click();
await page.waitForTimeout(700);

// "O que você já tem": responde as perguntas mostradas, uma por vez.
for (let i = 0; i < 12; i++) {
  if (i === 1) await shot(page, 'ob-6-tenho');
  const choice = page.locator('button.choice');
  if (!(await choice.count())) break;
  await choice.first().click();
  await page.waitForTimeout(250);
}
await shot(page, 'ob-6-tenho-fim');
await page.getByRole('button', { name: /Gerar minha jornada/ }).click();
await page.waitForTimeout(2500);
await shot(page, 'ob-7-jornada-criada', { wait: 1200 });
console.log('final url:', page.url());
console.log((await page.locator('main').innerText()).slice(0, 800));
await browser.close();
