/**
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT License.
 * =================================================================
 * A class based shim for the sorted BTree library
 */

import BTree from "sorted-btree";
import { ISortedTestingMap, TestingComparator } from "./utils";

/**
 * A shim to provide a common interface between the Sorted B Tree and the Sorted array
 * Used for testing.
 */
export default class SortedBTree implements ISortedTestingMap {
  private tree: BTree<number, number>;

  constructor(comparator: TestingComparator) {
    this.tree = new BTree([], comparator, 4);
  }

  get(k: number): number | undefined {
    return this.tree.get(k);
  }

  getIndex(
    index: number,
    isReversed: boolean,
    startKey: number
  ): [number, number] | undefined {
    let i = index;
    if (i >= this.tree.size) return undefined;

    if (!isReversed) {
      for (const entry of this.tree.entries(startKey)) {
        if (i > 0) {
          i--;
          continue;
        }
        return entry;
      }
    } else {
      for (const entry of this.tree.entriesReversed(startKey)) {
        if (i > 0) {
          i--;
          continue;
        }
        return entry;
      }
    }
    return undefined;
  }

  set(k: number, v: number) {
    return this.tree.set(k, v);
  }

  remove(k: number) {
    return this.tree.delete(k);
  }

  get size(): number {
    return this.tree.size;
  }
}
