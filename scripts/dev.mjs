import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electron from 'electron';
await import('./build-electron.mjs');
const server = await createServer();
await server.listen();
const env = { ...process.env, TOKENCAL_DEV_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { stdio: 'inherit', env });
const close = async () => {
  child.kill();
  await server.close();
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
