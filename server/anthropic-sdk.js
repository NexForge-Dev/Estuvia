// SDK da Anthropic carregado sob demanda: são ~150 ms (bem mais com o disco frio da Vercel) que toda partida a
// frio pagava mesmo sem nenhuma conversa com a IA. Carregado na primeira chamada e reaproveitado depois.
let sdk = null;
export const loadAnthropic = () => (sdk ??= import('@anthropic-ai/sdk').then((m) => m.default));
