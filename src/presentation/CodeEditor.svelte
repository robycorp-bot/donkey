<script lang="ts">
  import { onMount } from 'svelte';
  import type { editor, IDisposable } from 'monaco-editor/editor/editor.api.js';
  import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
  import JsonWorker from 'monaco-editor/languages/features/json/json.worker.js?worker';

  export let path: string;
  export let value: string;
  export let language: string;
  export let openPaths: string[];
  export let readOnly = false;
  export let visible = true;
  export let retro = false;
  export let onChange: (path: string, value: string) => void;
  export let onPosition: (line: number, column: number) => void;
  let container: HTMLDivElement;
  let instance: editor.IStandaloneCodeEditor | undefined;
  let monaco: typeof import('monaco-editor/editor/editor.api.js') | undefined;
  let currentPath = '';
  let error = '';
  let synchronizing = false;
  let wasVisible = false;
  const sessions = new Map<
    string,
    {
      model: editor.ITextModel;
      subscription: IDisposable;
      viewState: editor.ICodeEditorViewState | null;
    }
  >();

  /** Inserts text at the cursor as one undoable edit. */
  export function insertText(text: string): boolean {
    const model = instance?.getModel();
    const selection = instance?.getSelection();
    if (!instance || !model || !selection || readOnly) return false;
    instance.executeEdits('coder-mega-brain-ia', [{ range: selection, text, forceMoveMarkers: true }]);
    instance.pushUndoStop();
    instance.focus();
    return true;
  }

  function synchronize(
    nextPath: string,
    content: string,
    nextLanguage: string,
    paths: string[],
    locked: boolean,
    shown: boolean,
  ) {
    if (!instance || !monaco) return;
    const codeEditor = instance;
    const api = monaco;
    codeEditor.updateOptions({ readOnly: locked });

    const targetPath = paths.includes(nextPath) ? nextPath : '';
    const switching = targetPath !== currentPath;
    if (switching && currentPath) {
      const previous = sessions.get(currentPath);
      if (previous) previous.viewState = codeEditor.saveViewState();
    }

    if (!targetPath) {
      codeEditor.setModel(null);
      currentPath = '';
    } else {
      let session = sessions.get(targetPath);
      if (!session) {
        const model = api.editor.createModel(content, nextLanguage);
        session = {
          model,
          viewState: null,
          // Capture the model's path so a late event cannot edit a different tab.
          subscription: model.onDidChangeContent(() => {
            if (!synchronizing) onChange(targetPath, model.getValue(undefined, true));
          }),
        };
        sessions.set(targetPath, session);
      }
      if (session.model.getLanguageId() !== nextLanguage)
        api.editor.setModelLanguage(session.model, nextLanguage);
      if (codeEditor.getModel() !== session.model) {
        currentPath = targetPath;
        codeEditor.setModel(session.model);
        if (session.viewState) codeEditor.restoreViewState(session.viewState);
      }
      if (session.model.getValue(undefined, true) !== content) {
        synchronizing = true;
        try {
          // An explicit external update remains undoable; setValue clears the undo stack.
          session.model.pushStackElement();
          session.model.pushEditOperations(
            null,
            [{ range: session.model.getFullModelRange(), text: content }],
            () => null,
          );
          session.model.pushStackElement();
        } finally {
          synchronizing = false;
        }
      }
      if (shown && (switching || !wasVisible)) {
        codeEditor.layout();
        codeEditor.focus();
        const position = codeEditor.getPosition();
        if (position) onPosition(position.lineNumber, position.column);
      }
    }

    // Closed tabs release their models; ordinary tab changes preserve undo and view state.
    for (const [modelPath, session] of sessions) {
      if (!paths.includes(modelPath)) {
        session.subscription.dispose();
        session.model.dispose();
        sessions.delete(modelPath);
      }
    }
    wasVisible = shown;
  }

  onMount(() => {
    let disposed = false;
    const boot = async () => {
      self.MonacoEnvironment = {
        getWorker: (_moduleId: string, label: string) =>
          label === 'json' ? new JsonWorker() : new EditorWorker(),
      };
      const api = await import('monaco-editor/editor/editor.api.js');
      await Promise.all([
        import('monaco-editor/languages/definitions/typescript/register.js'),
        import('monaco-editor/languages/definitions/javascript/register.js'),
        import('monaco-editor/languages/definitions/css/register.js'),
        import('monaco-editor/languages/definitions/scss/register.js'),
        import('monaco-editor/languages/definitions/less/register.js'),
        import('monaco-editor/languages/definitions/html/register.js'),
        import('monaco-editor/languages/definitions/markdown/register.js'),
        import('monaco-editor/languages/definitions/rust/register.js'),
        import('monaco-editor/languages/definitions/shell/register.js'),
        import('monaco-editor/languages/definitions/yaml/register.js'),
        import('monaco-editor/languages/definitions/python/register.js'),
        import('monaco-editor/languages/definitions/cpp/register.js'),
        import('monaco-editor/languages/definitions/go/register.js'),
        import('monaco-editor/languages/definitions/dockerfile/register.js'),
        import('monaco-editor/languages/definitions/powershell/register.js'),
        import('monaco-editor/languages/definitions/ini/register.js'),
        import('monaco-editor/languages/definitions/sql/register.js'),
        import('monaco-editor/languages/definitions/xml/register.js'),
        import('monaco-editor/languages/definitions/ruby/register.js'),
        import('monaco-editor/languages/definitions/java/register.js'),
        import('monaco-editor/languages/definitions/csharp/register.js'),
        import('monaco-editor/languages/definitions/php/register.js'),
        import('monaco-editor/languages/features/json/register.js'),
        import('monaco-editor/features/find/register.js'),
        import('monaco-editor/features/clipboard/register.js'),
        import('monaco-editor/features/contextmenu/register.js'),
        import('monaco-editor/features/bracketMatching/register.js'),
        import('monaco-editor/features/wordOperations/register.js'),
        import('monaco-editor/features/linesOperations/register.js'),
        import('monaco-editor/features/folding/register.js'),
        import('monaco-editor/features/tokenization/register.js'),
      ]);
      if (disposed) return;
      monaco = api;
      api.editor.defineTheme('mega-brain', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '737F73', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'D4B7E9' },
          { token: 'string', foreground: 'C4DE9B' },
          { token: 'number', foreground: 'E8BC88' },
          { token: 'type', foreground: '9EC7CC' },
        ],
        colors: {
          'editor.background': '#202124',
          'editor.foreground': '#D1D7E4',
          'editorLineNumber.foreground': '#505867',
          'editorLineNumber.activeForeground': '#9CBBFF',
          'editor.lineHighlightBackground': '#252A34',
          'editor.selectionBackground': '#3D4F6B',
          'editorCursor.foreground': '#9CBBFF',
          'editorIndentGuide.background1': '#303541',
          'editorWidget.background': '#282D37',
          'editorWidget.border': '#404959',
        },
      });
      api.editor.defineTheme('mega-retro', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: '', foreground: '9FE870' },
          { token: 'comment', foreground: '4E7A3A', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'D7F5A0' },
          { token: 'string', foreground: 'F2C66D' },
          { token: 'number', foreground: 'F2C66D' },
          { token: 'type', foreground: 'B9F28A' },
        ],
        colors: {
          'editor.background': '#070A06',
          'editor.foreground': '#9FE870',
          'editorLineNumber.foreground': '#2F4A26',
          'editorLineNumber.activeForeground': '#9FE870',
          'editor.lineHighlightBackground': '#0F160C',
          'editor.selectionBackground': '#2A4420',
          'editorCursor.foreground': '#9FE870',
        },
      });
      const codeEditor = api.editor.create(container, {
        model: null,
        theme: 'mega-brain',
        automaticLayout: true,
        minimap: { enabled: false },
        fontFamily: '"Cascadia Code", "Consolas", monospace',
        fontSize: 13,
        lineHeight: 23,
        padding: { top: 22, bottom: 22 },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'all',
        tabSize: 2,
        wordWrap: 'on',
        smoothScrolling: true,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        ariaLabel: 'Editor de código',
        fixedOverflowWidgets: true,
      });
      instance = codeEditor;
      codeEditor.onDidChangeCursorPosition((e) =>
        onPosition(e.position.lineNumber, e.position.column),
      );
    };
    boot().catch(() => {
      error = 'Não foi possível carregar o editor. Reabra esta aba.';
    });
    return () => {
      disposed = true;
      instance?.setModel(null);
      instance?.dispose();
      for (const session of sessions.values()) {
        session.subscription.dispose();
        session.model.dispose();
      }
      sessions.clear();
    };
  });

  $: if (monaco) monaco.editor.setTheme(retro ? 'mega-retro' : 'mega-brain');
  $: if (instance && monaco) synchronize(path, value, language, openPaths, readOnly, visible);
</script>

<div class="code-editor" bind:this={container}>
  {#if error}<p class="editor-error">{error}</p>{/if}
</div>
