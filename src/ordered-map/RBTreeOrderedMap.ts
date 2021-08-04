import {
  empty,
  get,
  has,
  iterateFromFirst,
  iterateFromLast,
  RedBlackTreeStructure,
  remove,
  set,
} from "@collectable/red-black-tree";
import { IKeyValuePair } from "./IKeyValuePair";
import { IOrderedMap } from "./IOrderedMap";

export class RBTreeOrderedMap<K = any, V = any> implements IOrderedMap<K, V> {
  private _tree: RedBlackTreeStructure<K, V>;

  constructor() {
    this._tree = empty<K, V>(defaultComparator, true);
  }

  public get size(): number {
    return this._tree._size;
  }

  public get(key: K, defaultValue?: V): V | undefined {
    return get(key, this._tree) || defaultValue;
  }

  public set(key: K, value: V, _overwrite?: boolean): void {
    set(key, value, this._tree);
  }

  public has(key: K): boolean {
    return has(key, this._tree);
  }

  public delete(key: K): void {
    remove(key, this._tree);
  }

  public entries(_lowestKey?: K): IterableIterator<IKeyValuePair<K, V>> {
    return iterateFromFirst(this._tree);
  }

  public entriesReversed(
    _highestKey?: K
  ): IterableIterator<IKeyValuePair<K, V>> {
    return iterateFromLast(this._tree);
  }
}

const defaultComparator = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);
