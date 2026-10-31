import { spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

export async function openBrowser(profile) {
  const candidates = [process.env.ZOTGRAM_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  let executable;
  for (const path of candidates) {
    try { await access(path); executable = path; break; } catch { /* Try the next browser. */ }
  }
  assert.ok(executable, 'Set ZOTGRAM_BROWSER to a Chromium or Edge executable');
  await mkdir(profile, { recursive: true });
  const browserProcess = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let launchError;
  browserProcess.on('error', (error) => { launchError = error; });
  let socket;
  let send;
  const close = async () => {
    if (send && socket?.readyState === WebSocket.OPEN) {
      try { await send('Browser.close'); } catch { /* Already closed. */ }
    }
    socket?.close();
    browserProcess.kill();
  };
  try {
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      try { port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
      catch { await delay(100); }
    }
    assert.ok(port, 'Browser did not start');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((done, reject) => { socket.addEventListener('open', done, { once:true }); socket.addEventListener('error', reject, {once:true}); });
    const pending = new Map();
    const errors = [];
    let sequence = 0;
    socket.addEventListener('message', ({data}) => {
      const message = JSON.parse(data);
      if (message.id) {
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    });
    send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 10000);
      pending.set(id, {resolve, reject, timer});
      socket.send(JSON.stringify({id, method, params}));
    });
    const evaluate = async (expression) => {
      const response = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true, userGesture:true});
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    const waitFor = async (expression) => {
      for (let attempt = 0; attempt < 160; attempt++) {
        if (await evaluate(`Boolean(${expression})`)) return;
        await delay(50);
      }
      throw new Error(`Timed out: ${expression}; body: ${await evaluate('document.body.innerText')}`);
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {width:1280,height:900,deviceScaleFactor:1,mobile:false});
    return {send, evaluate, waitFor, errors, close};
  } catch (error) {
    await close();
    throw error;
  }
}
