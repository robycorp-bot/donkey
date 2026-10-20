import type { DocumentTab, FileDocument } from './models';

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  svelte: 'html',
  vue: 'html',
  rs: 'rust',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  java: 'java',
  c: 'cpp',
  h: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  ps1: 'powershell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sql: 'sql',
  xml: 'xml',
  svg: 'xml',
  dockerfile: 'dockerfile',
  txt: 'plaintext',
};

export function languageFromPath(path: string): string {
  const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  if (name === 'dockerfile') return 'dockerfile';
  const extension = name.includes('.') ? name.split('.').pop()! : '';
  return LANGUAGE_BY_EXTENSION[extension] ?? 'plaintext';
}

export function createDocumentTab(file: FileDocument): DocumentTab {
  return {
    ...file,
    language: file.language || languageFromPath(file.path),
    savedContent: file.content,
  };
}

export function isDocumentDirty(document: DocumentTab): boolean {
  return document.content !== document.savedContent;
}

export function updateDocumentContent(document: DocumentTab, content: string): DocumentTab {
  return document.content === content ? document : { ...document, content };
}

/** Confirm the exact saved snapshot without discarding edits made while saving. */
export function markDocumentSaved(
  document: DocumentTab,
  savedContent = document.content,
): DocumentTab {
  return { ...document, savedContent };
}

/** Reopening a tab must preserve unsaved edits instead of replacing them with disk content. */
export function openDocumentTab(tabs: DocumentTab[], file: FileDocument): DocumentTab[] {
  return tabs.some((tab) => tab.path === file.path) ? tabs : [...tabs, createDocumentTab(file)];
}
