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

export class RollbackMap<T, U> {
  private m: Map<T, U>;
  private buf: [OP, T, U][] = [];

  constructor(m_: Map<T, U>) {
    this.m = m_;
  }

  // These mutating functions have to have additional work

  set(k: T, v: U): Map<T, U> {
    this.buf.push([op.set, k, v]);
    return this.m.set(k, v);
  }

  delete(k: T): boolean {
    const v = this.m.get(k);
    if (!v) {
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

  get current(): Map<T, U> {
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

  get(k: T): U | undefined {
    return this.m.get(k);
  }

  has(k: T): boolean {
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
    callbackfn: (value: U, key: T, map: Map<T, U>) => void,
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
