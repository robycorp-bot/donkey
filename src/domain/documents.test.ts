import { describe, expect, it } from 'vitest';
import {
  createDocumentTab,
  isDocumentDirty,
  languageFromPath,
  markDocumentSaved,
  openDocumentTab,
  updateDocumentContent,
} from './documents';
import type { FileDocument } from './models';

const file: FileDocument = {
  path: 'C:\\project\\src\\main.ts',
  name: 'main.ts',
  content: 'original',
  language: 'typescript',
};

describe('document tabs', () => {
  it('tracks edits and recognizes a manual revert without changing the previous state', () => {
    const clean = createDocumentTab(file);
    const edited = updateDocumentContent(clean, 'edited');
    expect(isDocumentDirty(clean)).toBe(false);
    expect(isDocumentDirty(edited)).toBe(true);
    expect(clean.content).toBe('original');
    expect(isDocumentDirty(updateDocumentContent(edited, 'original'))).toBe(false);
  });

  it('keeps newer edits dirty when an earlier save completes', () => {
    const initial = createDocumentTab(file);
    const saving = updateDocumentContent(initial, 'snapshot sent to disk');
    const editing = updateDocumentContent(saving, 'new edit during save');
    const saved = markDocumentSaved(editing, saving.content);
    expect(saved.content).toBe('new edit during save');
    expect(saved.savedContent).toBe('snapshot sent to disk');
    expect(isDocumentDirty(saved)).toBe(true);
  });

  it('does not overwrite unsaved work or add duplicates when reopening a file', () => {
    const edited = updateDocumentContent(createDocumentTab(file), 'do not lose this');
    const tabs = [edited];
    expect(openDocumentTab(tabs, { ...file, content: 'disk version' })).toBe(tabs);
    expect(tabs[0].content).toBe('do not lose this');
    const opened = openDocumentTab(tabs, { ...file, path: 'other.ts' });
    expect(opened).toHaveLength(2);
    expect(tabs).toHaveLength(1);
  });

  it.each([
    ['C:\\code\\APP.TSX', 'typescript'],
    ['/project/Dockerfile', 'dockerfile'],
    ['/project/src/component.svelte', 'html'],
    ['/project/Cargo.toml', 'ini'],
    ['/project/main.c', 'cpp'],
    ['/project/file.unknown', 'plaintext'],
    ['/project/.gitignore', 'plaintext'],
    ['/folder.with.dot/README', 'plaintext'],
  ])('infers Monaco language for %s', (path, expected) => {
    expect(languageFromPath(path)).toBe(expected);
  });
});
