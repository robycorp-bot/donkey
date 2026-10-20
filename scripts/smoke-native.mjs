// Teste opt-in no WebView2 do app, iniciado com porta de depuração temporária.
// Somente use uma pasta descartável de teste. Não configura nem envia dados ao GitHub.
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
const port = Number(process.argv[2]);
const root = process.argv[3];
if (!port || !root)
  throw new Error('Uso: node scripts/smoke-native.mjs <porta CDP> <pasta de teste>');
let target;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = pages.find((page) => page.type === 'page' && /tauri|localhost/.test(page.url));
    if (target) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.ok(target, 'O WebView2 não disponibilizou o alvo de teste.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let serial = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) {
    const call = pending.get(data.id);
    pending.delete(data.id);
    clearTimeout(call.timeout);
    data.error ? call.reject(data.error) : call.resolve(data.result);
  }
});
function send(method, params = {}, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Tempo limite: ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function invoke(command, args = {}) {
  return evaluate(
    `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`,
  );
}
const passed = [];
try {
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`!!document.querySelector('[aria-label="Controle de versão"]')`)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const workspace = await invoke('get_workspace');
  assert.equal(workspace.path.toLowerCase(), root.toLowerCase());
  passed.push('abrir projeto por argumento');
  const document = await invoke('read_file', { path: `${root}/index.html` });
  const updated = document.content.replace('Teste pessoal', 'Teste salvo');
  await invoke('save_file', {
    path: document.path,
    content: updated,
    originalContent: document.content,
  });
  assert.equal(await readFile(document.path, 'utf8'), updated);
  passed.push('abrir e salvar arquivo nativo');
  await invoke('git_action', { action: 'stage', path: 'index.html' });
  await invoke('git_action', { action: 'commit', message: 'Teste nativo do editor' });
  assert.ok(
    (await invoke('git_status')).commits.some(
      (commit) => commit.subject === 'Teste nativo do editor',
    ),
  );
  passed.push('stage e commit real');
  await invoke('git_action', { action: 'branch', branch: 'teste-interface' });
  assert.equal((await invoke('git_status')).branch, 'teste-interface');
  passed.push('criar e trocar branch');
  await invoke('git_action', { action: 'push' });
  passed.push('push em remoto local descartável');
  const server = await invoke('project_start', { kind: 'static' });
  assert.ok(server.url.startsWith('http://127.0.0.1:'));
  assert.match(await (await fetch(server.url)).text(), /Teste salvo/);
  assert.equal((await fetch(`${server.url}.env`)).status, 403);
  passed.push('servidor HTTP local e bloqueio .env');
  await invoke('project_stop');
  assert.equal((await invoke('project_state')).running, false);
  passed.push('parar servidor');
  assert.ok((await invoke('project_scripts')).some((script) => script.name === 'smoke'));
  await invoke('project_start', { kind: 'script', script: 'smoke' });
  let run;
  for (let i = 0; i < 80; i++) {
    run = await invoke('project_state');
    if (!run.running && run.logs.some((line) => line.includes('SCRIPT_OK'))) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(run.exitCode, 0);
  assert.ok(run.logs.some((line) => line.includes('SCRIPT_OK')));
  passed.push('script npm com logs e saída 0');
  await evaluate(`document.querySelector('[aria-label="Controle de versão"]').click()`);
  let body = '';
  for (let i = 0; i < 30; i++) {
    body = await evaluate('document.body.innerText');
    if (body.includes('Teste nativo do editor')) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(body.includes('Teste nativo do editor'));
  passed.push('painel Git no WebView2 de produção');
  await evaluate(
    `document.querySelector('[role="dialog"] button[aria-label="Fechar janela"]').click();document.querySelector('[aria-label="Executar projeto"]').click()`,
  );
  for (let i = 0; i < 30; i++) {
    if (
      await evaluate(
        `Array.from(document.querySelectorAll('[role="dialog"] button')).some(button=>button.textContent.trim()==='Servidor HTML')`,
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 200));
  }
  await evaluate(
    `Array.from(document.querySelectorAll('[role="dialog"] button')).find(button=>button.textContent.trim()==='Servidor HTML').click()`,
  );
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`!!document.querySelector('#preview-url')?.value`)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  await evaluate(
    `Array.from(document.querySelectorAll('[role="dialog"] button')).find(button=>button.textContent.trim()==='Ver no editor').click()`,
  );
  let previewTarget;
  for (let i = 0; i < 30; i++) {
    const targets = await send('Target.getTargets');
    previewTarget = targets.targetInfos.find(
      (item) => item.type === 'iframe' && item.url.startsWith('http://127.0.0.1:'),
    );
    if (previewTarget) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(previewTarget, 'O iframe separado do WebView2 deve navegar na página local.');
  assert.match(await (await fetch(previewTarget.url)).text(), /Teste salvo/);
  passed.push('prévia HTML incorporada navegando no WebView2');
  await evaluate(`document.querySelector('[aria-label="Voltar ao código"]').click()`);
  assert.equal(
    await evaluate(`!!document.querySelector('iframe[title="Prévia do projeto"]')`),
    false,
  );
  passed.push('retornar da prévia para o editor');
  try {
    const capture = await send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false },
      5000,
    );
    await writeFile(
      new URL('../artifacts/native-ui.png', import.meta.url),
      Buffer.from(capture.data, 'base64'),
    );
  } catch {
    /* A captura é opcional; os resultados funcionais são registrados. */
  }
  const result = { passed, version: '0.2.0', target: target.url };
  console.log(JSON.stringify(result, null, 2));
  await writeFile(
    new URL('../artifacts/native-smoke.json', import.meta.url),
    JSON.stringify(result, null, 2),
  );
} catch (error) {
  const diagnostics = {
    passed,
    error: String(error),
    frames: await send('Page.getFrameTree'),
    targets: await send('Target.getTargets'),
    view: await evaluate(
      `({body:document.body.innerText.slice(-5000),iframe:document.querySelector('iframe')?.outerHTML??null})`,
    ),
  };
  await writeFile(
    new URL('../artifacts/native-smoke-error.json', import.meta.url),
    JSON.stringify(diagnostics, null, 2),
  );
  try {
    const capture = await send('Page.captureScreenshot', { format: 'png' }, 5000);
    await writeFile(
      new URL('../artifacts/native-preview-error.png', import.meta.url),
      Buffer.from(capture.data, 'base64'),
    );
  } catch {}
  throw error;
} finally {
  try {
    await invoke('project_stop');
  } catch {}
  socket.close();
}
