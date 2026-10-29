// E-mail transacional (recuperação de senha). Provedor: Resend (API HTTP, sem dependência extra).
// Sem RESEND_API_KEY: em desenvolvimento o conteúdo vai para o console; em produção o envio falha
// (e a recuperação de senha responde que o serviço está indisponível).
import { config } from './config.js';

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail({ to, subject, text, html }) {
  if (!emailEnabled()) {
    if (config.isProd) return false;
    console.log(`[e-mail] (desenvolvimento, sem RESEND_API_KEY/EMAIL_FROM) para ${to}: ${subject}\n${text}`);
    return true;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`[e-mail] falha no envio (HTTP ${res.status})`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[e-mail] falha no envio:', err.message);
    return false;
  }
}
