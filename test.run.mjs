// Runs test.html in headless Chrome at 390×844 (iPhone size) and exits 0 on PASS, 1 on FAIL, 2 when
// Chrome isn't found. Run: node test.run.mjs   (set CHROME=/path/to/chrome to pick a browser)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const chromePath = [process.env.CHROME,
  ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
    .map(d => join(d, 'Google/Chrome/Application/chrome.exe')),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(p => p && existsSync(p));
if (!chromePath) { console.error('test.run.mjs: Chrome not found; set CHROME=/path/to/chrome'); process.exit(2); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => readFile(join(ROOT, decodeURIComponent(req.url.split('?')[0])))
  .then(b => { res.writeHead(200, { 'content-type': TYPES[extname(req.url.split('?')[0])] || 'text/plain' }); res.end(b); })
  .catch(() => { res.writeHead(404); res.end(); }));
await new Promise(r => server.listen(0, '127.0.0.1', r));

// Short profile path: long ones break Chrome storage on Windows. Port 0: Chrome picks one and
// writes it to DevToolsActivePort.
const profile = mkdtempSync(join(tmpdir(), 'sc-'));
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const exited = new Promise(r => chrome.on('exit', r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
async function done(code, msg) {
  if (msg) (code ? console.error : console.log)(msg);
  ws?.close(); server.close(); chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

try {
  let port;
  for (let i = 0; i < 50 && !port; i++) {
    try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(200); }
  }
  if (!port) throw new Error('Chrome did not start');
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = {}, errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  };
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    pending[++seq] = m => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result));
    ws.send(JSON.stringify({ id: seq, method, params }));
  });
  const js = async expr => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/test.html` });
  let result;
  for (let i = 0; i < 75 && !result && !errors.length; i++) { await sleep(200); result = await js('window.testResult'); }
  if (!result) await done(1, `test.run.mjs: no result from test.html${errors.length ? '\n' + errors.join('\n') : ' (timeout)'}`);
  console.log(await js('document.getElementById("out").textContent'));
  await done(result.pass ? 0 : 1);
} catch (e) {
  await done(1, 'test.run.mjs: ' + e.message);
}
