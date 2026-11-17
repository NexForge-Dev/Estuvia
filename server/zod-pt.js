// Mensagens de validação do zod em português simples. Sem isto, rotas que devolvem
// `issues[0].message` mostravam ao estudante textos como "Too big: expected string to have <=80 characters"
// ou o regex cru do campo. Mensagens definidas no próprio schema continuam tendo prioridade.
import { z } from 'zod';

const n = (v) => (typeof v === 'bigint' ? Number(v) : v)?.toLocaleString?.('pt-BR') ?? String(v);

export function ptError(iss) {
  switch (iss.code) {
    case 'invalid_type':
      return iss.input === undefined || iss.input === null ? 'Preencha os campos obrigatórios.' : 'Valor em formato inválido.';
    case 'too_big':
      if (iss.origin === 'string') return `Use no máximo ${n(iss.maximum)} caracteres.`;
      if (iss.origin === 'array' || iss.origin === 'set') return `No máximo ${n(iss.maximum)} item(ns).`;
      if (iss.origin === 'number' || iss.origin === 'bigint') return `O valor máximo é ${n(iss.maximum)}.`;
      if (iss.origin === 'file') return 'Arquivo grande demais.';
      return 'Valor grande demais.';
    case 'too_small':
      if (iss.origin === 'string') return Number(iss.minimum) <= 1 ? 'Preencha os campos obrigatórios.' : `Use pelo menos ${n(iss.minimum)} caracteres.`;
      if (iss.origin === 'array' || iss.origin === 'set') return `Escolha pelo menos ${n(iss.minimum)} item(ns).`;
      if (iss.origin === 'number' || iss.origin === 'bigint') return iss.inclusive ? `O valor mínimo é ${n(iss.minimum)}.` : `O valor precisa ser maior que ${n(iss.minimum)}.`;
      return 'Valor pequeno demais.';
    case 'invalid_value':
    case 'invalid_union':
      return 'Opção inválida.';
    case 'invalid_format':
      if (iss.format === 'email') return 'E-mail inválido.';
      if (iss.format === 'url') return 'Link inválido.';
      if (iss.format === 'date' || iss.format === 'datetime') return 'Data inválida.';
      return 'Formato inválido.';
    case 'unrecognized_keys':
      return 'Há campos que não são aceitos aqui.';
    case 'not_multiple_of':
      return 'Valor inválido.';
    default:
      return 'Dados inválidos.';
  }
}

z.config({ customError: ptError });
