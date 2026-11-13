import { handleLine } from './protocol';

/**
 * Transporte stdio. O stdout é do protocolo e de mais nada:
 * qualquer log vai para o stderr, senão a conversa com o CLI quebra.
 */
let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  let cut = buffer.indexOf('\n');
  while (cut >= 0) {
    const line = buffer.slice(0, cut).trim();
    buffer = buffer.slice(cut + 1);
    if (line) {
      const response = handleLine(line);
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    }
    cut = buffer.indexOf('\n');
  }
});

process.stdin.on('end', () => process.exit(0));
process.stderr.write('donkey-harness MCP pronto (stdio)\n');
