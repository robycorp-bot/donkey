import { describe, expect, it } from 'vitest';
import { groupByCompany } from './workspace-tools';

describe('groupByCompany', () => {
  it('groups free models by company prefix in alphabetical order', () => {
    const groups = groupByCompany([
      { id: 'meta/a:free', name: 'A', company: 'meta' },
      { id: 'google/b:free', name: 'B', company: 'google' },
      { id: 'meta/c:free', name: 'C', company: 'meta' },
    ]);
    expect(groups.map(([company, list]) => [company, list.length])).toEqual([
      ['google', 1],
      ['meta', 2],
    ]);
  });
});
