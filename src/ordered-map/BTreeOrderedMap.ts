import BTree from "sorted-btree";
import { IKeyValuePair } from "./IKeyValuePair";
import { IOrderedMap } from "./IOrderedMap";

export class BTreeOrderedMap<K = any, V = any> implements IOrderedMap<K, V> {
  private readonly _tree: BTree;

  constructor() {
    this._tree = new BTree();
  }

  public get size(): number {
    return this._tree.size;
  }

  public get(key: K, defaultValue?: V): V | undefined {
    return this._tree.get(key, defaultValue);
  }

  public set(key: K, value: V, overwrite?: boolean): void {
    this._tree.set(key, value, overwrite);
  }

  public has(key: K): boolean {
    return this._tree.has(key);
  }

  public delete(key: K): void {
    this._tree.delete(key);
  }

  public *entries(lowestKey?: K): IterableIterator<IKeyValuePair<K, V>> {
    for (const value of this._tree.entries(lowestKey)) {
      yield this.toKeyValue(value);
    }
  }

  public *entriesReversed(
    highestKey?: K,
  ): IterableIterator<IKeyValuePair<K, V>> {
    for (const value of this._tree.entriesReversed(highestKey)) {
      yield this.toKeyValue(value);
    }
  }

  private toKeyValue(kvpAsArray?: [K, V]): IKeyValuePair<K, V> {
    if (kvpAsArray && kvpAsArray.length && kvpAsArray.length === 2) {
      return { key: kvpAsArray[0], value: kvpAsArray[1] };
    }

    return { key: undefined, value: undefined };
  }
}
