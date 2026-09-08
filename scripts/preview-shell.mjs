import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.GADGET_SHELL_PREVIEW_PORT ?? 17922);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
const output = await build({
  entryPoints: [fileURLToPath(new URL('../preview/main.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser', conditions: ['browser'],
  plugins: [{ name: 'shell-svelte', setup(builder) {
    builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
      contents: compile(await readFile(path, 'utf8'), { filename: path, generate: 'client', css: 'injected' }).js.code,
      loader: 'js'
    }));
  }}]
});
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gadget shell fixture preview</title></head><body><div id="app"></div><script type="module" src="/bundle.js"></script></body></html>';
const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (req.method !== 'GET' || !['/', '/bundle.js'].includes(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {
    'content-type': path === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  });
  res.end(path === '/' ? html : output.outputFiles[0].contents);
});
server.listen(port, '127.0.0.1', () => console.log(`Fixture shell: http://127.0.0.1:${port}`));
