/**
 * Basic code formatting with Prettier running inside the app (no network, no project config).
 * Returns null when the language has no built-in formatter.
 */
type Parser = { parser: string; plugins: () => Promise<unknown[]> };

const js = () => Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]);
const ts = () =>
  Promise.all([import('prettier/plugins/typescript'), import('prettier/plugins/estree')]);
const css = () => Promise.all([import('prettier/plugins/postcss')]);
const html = () =>
  Promise.all([
    import('prettier/plugins/html'),
    import('prettier/plugins/postcss'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
  ]);
const md = () => Promise.all([import('prettier/plugins/markdown')]);
const yaml = () => Promise.all([import('prettier/plugins/yaml')]);

const svelte = () =>
  Promise.all([
    // The package entry works in both Vite and the Vitest/jsdom worker. The
    // browser-only entry can leave a dynamic import pending under jsdom.
    import('prettier-plugin-svelte'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/typescript'),
    import('prettier/plugins/estree'),
    import('prettier/plugins/postcss'),
  ]);

const BY_EXTENSION: Record<string, Parser> = {
  svelte: { parser: 'svelte', plugins: svelte },
  vue: { parser: 'vue', plugins: html },
  jsonc: { parser: 'json', plugins: js },
  mdx: { parser: 'mdx', plugins: md },
};

const BY_LANGUAGE: Record<string, Parser> = {
  javascript: { parser: 'babel', plugins: js },
  typescript: { parser: 'typescript', plugins: ts },
  json: { parser: 'json', plugins: js },
  css: { parser: 'css', plugins: css },
  scss: { parser: 'scss', plugins: css },
  less: { parser: 'less', plugins: css },
  html: { parser: 'html', plugins: html },
  vue: { parser: 'vue', plugins: html },
  markdown: { parser: 'markdown', plugins: md },
  yaml: { parser: 'yaml', plugins: yaml },
};

function pick(path: string, language: string): Parser | undefined {
  const extension = path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? BY_LANGUAGE[language];
}

export function canFormat(path: string, language: string): boolean {
  return pick(path, language) !== undefined;
}

export async function formatCode(
  code: string,
  path: string,
  language: string,
): Promise<string | null> {
  const entry = pick(path, language);
  if (!entry) return null;
  const [{ format }, plugins] = await Promise.all([import('prettier/standalone'), entry.plugins()]);
  return format(code, {
    parser: entry.parser,
    plugins: plugins as never[],
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
    tabWidth: 2,
  });
}
