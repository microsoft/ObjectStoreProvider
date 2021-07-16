/**
 * A very simple map with an infinite undo buffer.
 * Used to roll back transactions.
 * Optimized for the case where rollbacks are uncommon.
 */

const op = {
  set: 0,
  remove: 1,
} as const;

type OP = typeof op[keyof typeof op];

export class RollbackMap<K, V> {
  private m: Map<K, V>;
  private buf: [OP, K, V][] = [];

  constructor(m_: Map<K, V>) {
    this.m = m_;
  }

  // These mutating functions have to have additional work

  set(k: K, v: V): Map<K, V> {
    this.buf.push([op.set, k, v]);
    return this.m.set(k, v);
  }

  delete(k: K): boolean {
    const v = this.m.get(k);
    if (v === undefined) {
      return false;
    }
    this.buf.push([op.remove, k, v]);
    return this.m.delete(k);
  }

  clear(): void {
    this.m.clear();
    this.buf = [];
  }

  // special functions unique to this class

  get current(): Map<K, V> {
    return this.m;
  }

  rollbackToOriginal(): void {
    // In reverse order, undo the changes to the map.
    for (let i = this.buf.length - 1; i >= 0; i--) {
      const [opcode, k, v] = this.buf[i];
      switch (opcode) {
        case op.remove:
          // Since this is a remove, add it back in.
          this.m.set(k, v);
          break;
        case op.set:
          this.m.delete(k);
          break;
      }
    }
    this.buf = [];
  }

  flushUndoBuffer(): void {
    this.buf = [];
  }

  // These functions are just proxying the map interface

  get(k: K): V | undefined {
    return this.m.get(k);
  }

  has(k: K): boolean {
    return this.m.has(k);
  }

  entries() {
    return this.m.entries();
  }

  keys() {
    return this.m.keys();
  }

  values() {
    return this.m.values();
  }

  forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any
  ) {
    return this.m.forEach(callbackfn, thisArg);
  }

  [Symbol.iterator]() {
    return this.m.forEach;
  }

  get size() {
    return this.m.size;
  }
}
