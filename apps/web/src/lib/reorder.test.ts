import { describe, expect, it } from 'vitest';
import { moveItem } from './reorder';

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('sube y baja un elemento una posición', () => {
    expect(moveItem(list, 2, -1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveItem(list, 1, 1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('no se sale de los extremos', () => {
    expect(moveItem(list, 0, -1)).toEqual(list);
    expect(moveItem(list, 3, 1)).toEqual(list);
  });

  it('no modifica la lista original', () => {
    const copy = [...list];
    moveItem(list, 0, 1);
    expect(list).toEqual(copy);
  });
});
