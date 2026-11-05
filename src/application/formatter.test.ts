import { describe, expect, it } from 'vitest';
import { canFormat, formatCode } from './formatter';

describe('formatter', () => {
  it('formats common web languages by default', async () => {
    expect(await formatCode('const a={b:1,c:"x"}', 'a.ts', 'typescript')).toBe(
      "const a = { b: 1, c: 'x' };\n",
    );
    expect(await formatCode('a{color:red}', 'a.css', 'css')).toBe('a {\n  color: red;\n}\n');
    expect(await formatCode('{"a":1}', 'a.json', 'json')).toBe('{ "a": 1 }\n');
  });
  it('uses the file extension for Svelte and skips unknown languages', async () => {
    expect(canFormat('App.svelte', 'html')).toBe(true);
    expect(await formatCode('<p>{a}</p>', 'App.svelte', 'html')).toBe('<p>{a}</p>\n');
    expect(canFormat('main.rs', 'rust')).toBe(false);
    expect(await formatCode('fn main(){}', 'main.rs', 'rust')).toBeNull();
  });
});
