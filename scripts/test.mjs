// Roda a suíte sempre com os providers locais (JSON + disco), mesmo que o .env de
// desenvolvimento aponte para Supabase. Assim `npm test` não toca no banco real.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const env = {
  ...process.env,
  DB_PROVIDER: 'json',
  STORAGE_PROVIDER: 'local',
  // Impede o dotenv de carregar o .env de desenvolvimento (dotenv não sobrescreve o que já existe).
  DOTENV_CONFIG_PATH: path.join(os.tmpdir(), 'estuvia-test-no-env'),
};
for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'JWT_SECRET', 'DOCUMENTS_KEY']) delete env[key];

const child = spawn(process.execPath, ['--test', 'tests/*.test.js'], { stdio: 'inherit', env });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
