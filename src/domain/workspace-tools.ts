export interface GitChange {
  path: string;
  previousPath: string | null;
  index: string;
  worktree: string;
}
export interface GitCommit {
  hash: string;
  subject: string;
}
export interface GitState {
  available: boolean;
  repository: boolean;
  branch: string;
  branches: string[];
  changes: GitChange[];
  commits: GitCommit[];
  remote: boolean;
  remoteUrl: string;
  ahead: number;
  behind: number;
}
export interface TerminalResult {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}
export interface CatalogModel {
  id: string;
  name: string;
  company: string;
  free: boolean;
  inputPerMillion: number;
  outputPerMillion: number;
  context: number;
}
export type FreeModel = Pick<CatalogModel, 'id' | 'name' | 'company'>;
export function groupByCompany<T extends FreeModel>(models: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const model of models) groups.set(model.company, [...(groups.get(model.company) ?? []), model]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
export type GitAction =
  | 'init'
  | 'stage'
  | 'stage_all'
  | 'unstage'
  | 'commit'
  | 'branch'
  | 'switch'
  | 'push'
  | 'pull'
  | 'fetch'
  | 'sync'
  | 'remote';
export interface ProjectScript {
  name: string;
  command: string;
}
export interface ProjectState {
  running: boolean;
  label: string;
  url: string | null;
  logs: string[];
  exitCode: number | null;
}
export function localPreviewUrl(value: string): string {
  const url = new URL(value.trim());
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error('Use uma URL HTTP local, como http://localhost:5173.');
  return url.href;
}
export function isStaged(change: GitChange): boolean {
  return change.index !== ' ' && change.index !== '?';
}
export function isUnstaged(change: GitChange): boolean {
  return change.worktree !== ' ';
}
