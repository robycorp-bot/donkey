/**
 * Stub: futura geração de XML/JSON fictício com a mesma forma do original.
 */
export function synthesizePlaceholder(hint: 'xml' | 'json' | 'text'): string {
  if (hint === 'xml') {
    return '<registro><id>SYN-0001</id><nome>Cliente Fictício</nome><valor>0.00</valor></registro>';
  }
  if (hint === 'json') {
    return '{"id":"SYN-0001","nome":"Cliente Fictício","valor":0}';
  }
  return 'Conteúdo sintético — substitua pelo pipeline real.';
}
