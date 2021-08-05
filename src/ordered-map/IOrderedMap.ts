import { IKeyValuePair } from "./IKeyValuePair";

export interface IOrderedMap<K, V> {
  /** Gets the number of key-value pairs in the tree. */
  get size(): number;
  /**
   * Finds a pair in the tree and returns the associated value.
   * @param defaultValue a value to return if the key was not found.
   * @returns the value, or defaultValue if the key was not found.
   * @description Computational complexity: O(log size)
   */
  get(key: K, defaultValue?: V): V | undefined;
  /**
   * Adds or overwrites a key-value pair in the B+ tree.
   * @param key the key is used to determine the sort order of
   *        data in the tree.
   * @param value data to associate with the key (optional)
   * @param overwrite Whether to overwrite an existing key-value pair
   *        (default: true). If this is false and there is an existing
   *        key-value pair then this method has no effect.
   * @description Computational complexity: O(log size)
   * Note: when overwriting a previous entry, the key is updated
   * as well as the value. This has no effect unless the new key
   * has data that does not affect its sort order.
   */
  set(key: K, value: V, overwrite?: boolean): void;
  /**
   * Returns true if the key exists in the B+ tree, false if not.
   * Use get() for best performance; use has() if you need to
   * distinguish between "undefined value" and "key not present".
   * @param key Key to detect
   * @description Computational complexity: O(log size)
   */
  has(key: K): boolean;
  /**
   * Removes a single key-value pair from the B+ tree.
   * @param key Key to find
   * @description Computational complexity: O(log size)
   */
  delete(key: K): void;
  /** Returns an iterator that provides items in order (ascending order if
   *  the collection's comparator uses ascending order, as is the default.)
   *  @param lowestKey First key to be iterated, or undefined to start at
   *         minKey(). If the specified key doesn't exist then iteration
   *         starts at the next higher key (according to the comparator).
   */
  entries(lowestKey?: K): IterableIterator<IKeyValuePair<K, V>>;
  /** Returns an iterator that provides items in reversed order.
   *  @param highestKey Key at which to start iterating, or undefined to
   *         start at maxKey(). If the specified key doesn't exist then iteration
   *         starts at the next lower key (according to the comparator).
   */
  entriesReversed(highestKey?: K): IterableIterator<IKeyValuePair<K, V>>;
}
