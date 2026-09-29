/** Devuelve una copia con el elemento `index` movido una posición arriba (-1) o abajo (+1). */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  const copy = [...list];
  if (target < 0 || target >= copy.length) return copy;
  const [item] = copy.splice(index, 1);
  if (item === undefined) return copy;
  copy.splice(target, 0, item);
  return copy;
}
