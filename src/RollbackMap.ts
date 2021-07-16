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

/**
 * By trial and error: the average number of operations done to a transaction.
 */
const THRESHOLD = 40;
export interface IRollbackMap<K, V> {
  // These mutating functions have to have additional work

  set(k: K, v: V): Map<K, V>;

  delete(k: K): boolean;

  clear(): void;

  // special functions unique to this class

  get current(): Map<K, V>;

  rollback(): void;

  commit(): void;

  // These functions are just proxying the map interface

  get(k: K): V | undefined;

  has(k: K): boolean;

  entries(): IterableIterator<[K, V]>;

  keys(): IterableIterator<K>;

  values(): IterableIterator<V>;

  forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any
  ): void;

  [Symbol.iterator](): (
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any
  ) => void;

  get size(): number;
}

export function makeRollbackMap<K, V>(m: Map<K, V>): IRollbackMap<K, V> {
  if (m.size < THRESHOLD) {
    return new CopyRollbackMap(m);
  }
  return new RollbackMap(m);
}

export class RollbackMap<K, V> implements IRollbackMap<K, V> {
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

  rollback(): void {
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

  commit(): void {
    this.buf = [];
  }

  // These functions are just proxying the map interface

  get(k: K): V | undefined {
    return this.m.get(k);
  }

  has(k: K): boolean {
    return this.m.has(k);
  }

  entries(): IterableIterator<[K, V]> {
    return this.m.entries();
  }

  keys(): IterableIterator<K> {
    return this.m.keys();
  }

  values(): IterableIterator<V> {
    return this.m.values();
  }

  forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any
  ): void {
    return this.m.forEach(callbackfn, thisArg);
  }

  [Symbol.iterator](): (
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any
  ) => void {
    return this.m.forEach;
  }

  get size(): number {
    return this.m.size;
  }
}

export class CopyRollbackMap<K, V> implements IRollbackMap<K, V> {
  private orig: Map<K, V>;
  private m: Map<K, V>;

  constructor(m_: Map<K, V>) {
    this.orig = new Map(m_);
    this.m = m_;
  }

  set(k: K, v: V): Map<K, V> {
    return this.m.set(k, v);
  }

  delete(k: K): boolean {
    return this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
  get current(): Map<K, V> {
    return this.m;
  }
  rollback(): void {
    this.m = this.orig;
  }
  commit(): void {
    this.orig = this.m;
  }
  get(k: K): V | undefined {
    return this.m.get(k);
  }
  has(k: K): boolean {
    return this.m.has(k);
  }
  entries(): IterableIterator<[K, V]> {
    return this.m.entries();
  }
  keys(): IterableIterator<K> {
    return this.m.keys();
  }
  values(): IterableIterator<V> {
    return this.m.values();
  }
  forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any
  ): void {
    return this.m.forEach(callbackfn, thisArg);
  }
  get size(): number {
    return this.m.size;
  }
  [Symbol.iterator](): (
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any
  ) => void {
    return this.m.forEach;
  }
}
