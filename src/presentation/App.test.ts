// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

// Monaco is exercised by the e2e smoke test; here a textarea stands in for it.
vi.mock('./CodeEditor.svelte', async () => ({
  default: (await import('../test/CodeEditorStub.svelte')).default,
}));

import App from './App.svelte';

async function openExample() {
  const user = userEvent.setup();
  render(App);
  await user.click(screen.getByRole('button', { name: 'Explorar exemplo' }));
  await screen.findByText('README.md');
  return user;
}
async function openFile(user: ReturnType<typeof userEvent.setup>, ...path: string[]) {
  for (const part of path) await user.click(await screen.findByTitle(part));
  return screen.findByLabelText('editor') as Promise<HTMLTextAreaElement>;
}
const editorText = () => (screen.getByLabelText('editor') as HTMLTextAreaElement).value;

describe('App · casca do editor', () => {
  it('abre na Central de IA com o Monitor ao lado', () => {
    render(App);
    expect(screen.getByRole('button', { name: /Central IA/ })).toBeTruthy();
    expect(screen.getByText('Monitor de IA')).toBeTruthy();
    expect(screen.getByText(/0 de 4 IAs conectadas/)).toBeTruthy();
  });

  it('explora o projeto de exemplo, abre pastas e filtra arquivos', async () => {
    const user = await openExample();
    await user.click(screen.getByTitle('src'));
    expect(await screen.findByTitle('main.ts')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Recolher pastas' }));
    expect(screen.queryByTitle('main.ts')).toBeNull();
    await user.type(screen.getByLabelText('Filtrar arquivos carregados'), 'read');
    expect(screen.getByTitle('README.md')).toBeTruthy();
    expect(screen.queryByTitle('package.json')).toBeNull();
  });

  it('editar marca alteração; Ctrl+S formata e salva', async () => {
    const user = await openExample();
    const editor = await openFile(user, 'src', 'main.ts');
    expect(screen.getByText('salvo')).toBeTruthy();
    await fireEvent.input(editor, { target: { value: 'const a={b:1}' } });
    expect(screen.getByText('alterações não salvas')).toBeTruthy();
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(screen.getByText('salvo')).toBeTruthy());
    expect(editorText()).toBe('const a = { b: 1 };\n');
    expect(screen.getByText(/Salvo na memória desta prévia/)).toBeTruthy();
  });

  it('Shift+Alt+F formata sem salvar; desligar "ao salvar" salva sem formatar', async () => {
    const user = await openExample();
    const editor = await openFile(user, 'src', 'main.ts');
    await fireEvent.input(editor, { target: { value: 'let x=1' } });
    await user.keyboard('{Shift>}{Alt>}F{/Alt}{/Shift}');
    await waitFor(() => expect(editorText()).toBe('let x = 1;\n'));
    expect(screen.getByText('alterações não salvas')).toBeTruthy();
    await user.click(screen.getByLabelText(/ao salvar/));
    expect(localStorage.getItem('cmb.formatOnSave')).toBe('false');
    await fireEvent.input(screen.getByLabelText('editor'), { target: { value: 'let y=2' } });
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(screen.getByText('salvo')).toBeTruthy());
    expect(editorText()).toBe('let y=2');
  });

  it('o botão Formatar formata Markdown também', async () => {
    const user = await openExample();
    const editor = await openFile(user, 'README.md');
    await fireEvent.input(editor, { target: { value: '#  Título\n\n\n\ntexto' } });
    await user.click(screen.getByRole('button', { name: /Formatar/ }));
    await waitFor(() => expect(editorText()).toBe('# Título\n\ntexto\n'));
    expect(screen.getByText('Código formatado.')).toBeTruthy();
  });

  it('fechar aba com alteração pede confirmação', async () => {
    const user = await openExample();
    const editor = await openFile(user, 'README.md');
    await fireEvent.input(editor, { target: { value: 'mudou' } });
    await user.click(screen.getByRole('button', { name: 'Fechar README.md' }));
    const dialog = screen.getByRole('dialog', { name: 'Alterações não salvas' });
    await user.click(within(dialog).getByRole('button', { name: 'Voltar e salvar' }));
    expect(screen.getByLabelText('editor')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Fechar README.md' }));
    await user.click(screen.getByRole('button', { name: 'Descartar e continuar' }));
    expect(screen.queryByRole('button', { name: 'Fechar README.md' })).toBeNull();
  });

  it('fecha a aba ativa com Ctrl W e oferece um botão visível de fechar', async () => {
    const user = await openExample();
    await openFile(user, 'README.md');
    expect(screen.getByRole('button', { name: 'Fechar aba ativa' })).toBeTruthy();
    await user.keyboard('{Control>}w{/Control}');
    expect(screen.queryByRole('button', { name: 'Fechar README.md' })).toBeNull();
    expect(screen.getByRole('button', { name: /Central IA/ })).toBeTruthy();
  });

  it('atalhos: Ctrl+B lateral, Ctrl+` terminal, Ctrl+K comandos, Esc fecha', async () => {
    const user = await openExample();
    await user.keyboard('{Control>}b{/Control}');
    expect(document.querySelector('.workbench')?.classList.contains('sidebar-hidden')).toBe(true);
    await user.keyboard('{Control>}b{/Control}');
    await user.keyboard('{Control>}`{/Control}');
    expect(await screen.findByLabelText('Comando do terminal')).toBeTruthy();
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: 'Comandos' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('terminal exige uma pasta aberta', async () => {
    render(App);
    await userEvent.setup().keyboard('{Control>}`{/Control}');
    expect(screen.queryByLabelText('Comando do terminal')).toBeNull();
    expect(await screen.findByText('Abra uma pasta de projeto primeiro.')).toBeTruthy();
  });

  it('aba Git na prévia explica que roda no app instalado', async () => {
    const user = await openExample();
    await user.click(screen.getByRole('tab', { name: /Git/ }));
    expect(screen.getByText(/O Git funciona no aplicativo instalado/)).toBeTruthy();
  });

  it('arrastar a borda redimensiona a lateral e lembra o tamanho', async () => {
    render(App);
    const handle = screen.getByRole('separator', { name: 'Redimensionar barra lateral' });
    await fireEvent.pointerDown(handle, { clientX: 260, pointerId: 1 });
    await fireEvent.pointerMove(handle, { clientX: 360, pointerId: 1 });
    await fireEvent.pointerUp(handle, { pointerId: 1 });
    const workbench = document.querySelector('.workbench') as HTMLElement;
    expect(workbench.style.getPropertyValue('--sidebar-w')).toBe('360px');
    expect(localStorage.getItem('cmb.sidebar')).toBe('360');
    await fireEvent.dblClick(handle);
    expect(workbench.style.getPropertyValue('--sidebar-w')).toBe('260px');
  });

  it('o tamanho tem limites mínimo e máximo', async () => {
    render(App);
    const handle = screen.getByRole('separator', { name: 'Redimensionar barra lateral' });
    await fireEvent.pointerDown(handle, { clientX: 260 });
    await fireEvent.pointerMove(handle, { clientX: -900 });
    await fireEvent.pointerUp(handle);
    expect((document.querySelector('.workbench') as HTMLElement).style.getPropertyValue('--sidebar-w')).toBe('160px');
  });

  it('visual terminal antigo liga e é lembrado', async () => {
    render(App);
    await userEvent.setup().click(screen.getByRole('button', { name: /moderno/ }));
    expect(document.querySelector('.app-shell')?.classList.contains('retro')).toBe(true);
    expect(localStorage.getItem('cmb.retro')).toBe('true');
  });

  it('configurações de chave ficam bloqueadas na prévia do navegador', async () => {
    render(App);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Configurações de IA' }));
    const dialog = screen.getByRole('dialog', { name: 'Configurações de IA' });
    expect((within(dialog).getByLabelText(/Chave da API/) as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText(/Chave da API/) as HTMLInputElement).type).toBe('password');
    expect(within(dialog).getByText(/Abra o aplicativo desktop/)).toBeTruthy();
  });

  it('esconder o monitor dá mais espaço ao centro', async () => {
    render(App);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Alternar monitor de IA' }));
    expect(screen.queryByText('Monitor de IA')).toBeNull();
  });
});
