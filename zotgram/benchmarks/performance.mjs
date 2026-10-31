import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { openBrowser } from '../tests/browser/driver.mjs';
import { apiFixture } from '../tests/browser/fixture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const repository = resolve(root, '..');
const exec = promisify(execFile);
const delay = (ms) => new Promise(done => setTimeout(done, ms));
const names = 'ChatContent|ChatComposer|ChatMessage|Comments|CommentComposer|CommentRow|ChatsListItem|Header|LeftBar|Post';

function measuredSources(ref) {
  return {
    name: 'measure-render-counts', enforce: 'pre',
    async load(id) {
      const file = id.split('?')[0];
      if (!ref || !file.replaceAll('\\', '/').startsWith(root.replaceAll('\\', '/') + 'src/') || !/\.[jt]sx?$/.test(file)) return;
      const path = relative(repository, file).replaceAll('\\', '/');
      return (await exec('git', ['show', `${ref}:${path}`], {cwd:repository, windowsHide:true})).stdout;
    },
    transform(code, id) {
      if (!id.replaceAll('\\', '/').includes('/src/components/')) return;
      code = code.replace(new RegExp(`function (${names})\\([^]*?\\)\\s*\\{`, 'g'),
        (signature, name) => `${signature}\nglobalThis.__measureRender?.('${name}');` +
          (name === 'ChatMessage' ? '\nglobalThis.__measureProps?.(message.id, {message,author,own,read,onImageLoad});' : ''));
      code = code.replace('chatMessages.map((msg) => {', "chatMessages.map((msg) => { globalThis.__measureRender?.('ChatMessage');");
      code = code.replace('comments.map((comment) => {', "comments.map((comment) => { globalThis.__measureRender?.('CommentRow');");
      return {code, map:null};
    },
  };
}

async function measure(ref) {
  const server = await createServer({root, configFile:false, logLevel:'error',
    plugins:[measuredSources(ref), react()], server:{host:'127.0.0.1',port:0,open:false,hmr:false,watch:null}});
  await server.listen();
  const browser = await openBrowser(resolve(repository, `.tmp/performance/${Date.now()}-${ref || 'current'}`))
    .catch(async (error) => { await server.close(); throw error; });
  const {send, evaluate, waitFor} = browser;
  const countRequests = (condition) => evaluate(`__requests.filter(request => ${condition}).length`);
  const type = async (selector) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await evaluate('__renders = {}');
    for (let index = 0; index < 30; index++) {
      await send('Input.insertText', {text:'x'});
      await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
    }
    return evaluate('__renders');
  };
  const openChat = async () => {
    await evaluate('document.querySelector(\'a[href="/chats"]\').click()');
    await waitFor("document.querySelector('.chats-list-item')");
    await evaluate('document.querySelector(\'a[href="/chats/chat-a"]\').click()');
    await waitFor("document.querySelectorAll('.chat__message').length >= 50");
    await delay(250);
  };
  try {
    await send('Page.addScriptToEvaluateOnNewDocument', {source:`
      window.__renders = {};
      window.__measureRender = name => { window.__renders[name] = (window.__renders[name] || 0) + 1; };
      window.__rowChanges = [];
      const previousProps = new Map();
      window.__measureProps = (id, props) => {
        const previous = previousProps.get(id);
        if (previous) {
          const changed = Object.keys(props).filter(key => previous[key] !== props[key]);
          if (changed.length) window.__rowChanges.push({id,changed});
        }
        previousProps.set(id, props);
      };
      window.__fixtureOptions = {messages:50,delay:20};
      (${apiFixture.toString()})();
    `});
    const address = server.httpServer.address();
    await send('Page.navigate', {url:`http://127.0.0.1:${address.port}/`});
    await waitFor("document.querySelector('.post')");
    await delay(200);
    const toggle = "[...document.querySelectorAll('.post__buttons-item')].find(button => button.textContent.trim() === 'Комментарии').click()";
    await evaluate(toggle);
    await waitFor("document.querySelector('.comments__text')");
    const older = await evaluate("Boolean(document.querySelector('.comments .pagination-control button'))");
    if (older) await evaluate("document.querySelector('.comments .pagination-control button').click()");
    await waitFor("document.querySelectorAll('.comments__text').length === 26");
    const commentTyping = await type('.comments__input');
    await evaluate(toggle);
    await waitFor("!document.querySelector('.comments')");
    const beforeComments = await countRequests("request.path.endsWith('/comments/') && request.method === 'GET'");
    await evaluate(toggle);
    await waitFor("document.querySelectorAll('.comments__text').length === 26");
    await delay(100);
    const repeatedComments = await countRequests("request.path.endsWith('/comments/') && request.method === 'GET'") - beforeComments;
    await openChat();
    const messageTyping = await type('.chat__input-field');
    await evaluate('__renders = {}; __rowChanges = []');
    const beforeMessage = await countRequests("request.method === 'GET' && request.path.startsWith('/api/chat/')");
    await evaluate("__incoming('Измерение входящего сообщения')");
    await waitFor("document.querySelectorAll('.chat__message').length === 51");
    await delay(200);
    const incoming = await evaluate('__renders');
    const rowChanges = await evaluate('__rowChanges.slice(0, 8)');
    const incomingGet = await countRequests("request.method === 'GET' && request.path.startsWith('/api/chat/')") - beforeMessage;
    await evaluate('document.querySelector(\'a[href="/"]\').click()');
    await waitFor("document.querySelector('.post')");
    await delay(150);
    const beforeAvatar = await countRequests("request.path.endsWith('/avatar/')");
    const beforePeople = await countRequests("request.path.endsWith('/users/batch/')");
    await openChat();
    const repeatedAvatar = await countRequests("request.path.endsWith('/avatar/')") - beforeAvatar;
    const repeatedPeople = await countRequests("request.path.endsWith('/users/batch/')") - beforePeople;
    assert.deepEqual(browser.errors, []);
    if (!ref) {
      assert.equal(messageTyping.ChatMessage || 0, 0, 'Typing must not render message rows');
      assert.equal(commentTyping.CommentRow || 0, 0, 'Typing must not render comment rows');
      assert.equal(repeatedComments, 0);
      assert.equal(repeatedAvatar, 0);
      assert.equal(repeatedPeople, 0);
      assert.equal(incomingGet, 0);
      assert.equal(rowChanges.length, 0, 'Incoming messages must preserve previous row props');
    }
    return {ref:ref || 'working-tree', characters:30, messages:50, comments:26,
      messageTyping, commentTyping, incoming, rowChanges, incomingGet, repeatedComments, repeatedAvatar, repeatedPeople};
  } finally {
    await browser.close();
    await server.close();
  }
}

const refs = process.argv.includes('--current-only') ? [null] : ['f59c1391', 'cc14dcf5', null];
const results = [];
for (const ref of refs) {
  const result = await measure(ref);
  results.push(result);
  console.log(JSON.stringify(result));
}
if (refs.length === 3) {
  await mkdir(resolve(root, 'benchmarks'), {recursive:true});
  await writeFile(resolve(root, 'benchmarks/latest.json'), JSON.stringify({
    measuredAt:new Date().toISOString(), environment:'Headless Chromium, Vite development, React StrictMode, synthetic API with 20 ms delay',
    results,
  }, null, 2) + '\n');
}
