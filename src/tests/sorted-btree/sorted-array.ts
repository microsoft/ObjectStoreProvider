/**
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT License.
 * =================================================================
 * Implements a very simple sorted array, for use in testing.
 * Focus on correctness, not performance at all.
 */

import {
  DEFAULT_COMPARATOR,
  ISortedTestingMap,
  isWithinBounds,
  TestingComparator,
} from "./utils";

type KV = { key: number; val: number };

export default class SortedArray implements ISortedTestingMap {
  private data: KV[];
  private comp: any;

  constructor(comparator: TestingComparator) {
    this.data = []; // array of an object containing a key and val
    this.comp = comparator || DEFAULT_COMPARATOR;
  }

  get(k: number) {
    const lb = lowerBoundUnique(this.data, this.comp, k);
    if (!isWithinBounds(this.data, lb)) {
      return undefined;
    }
    const elt = this.data[lb];
    if (this.comp(k, elt.key) === 0) {
      return elt.val;
    }
    return undefined;
  }

  getIndex(
    index: number,
    isReversed: boolean,
    startKey: number,
  ): [number, number] | undefined {
    let i = index;
    let entry;
    if (index >= this.data.length) return undefined;

    if (!isReversed) {
      if (startKey !== undefined) {
        const lb = lowerBoundUnique(this.data, this.comp, startKey);
        if (isWithinBounds(this.data, lb + i)) {
          entry = this.data[lb + i];
        } else {
          return undefined;
        }
      } else {
        entry = this.data[i];
      }
    } else {
      if (startKey !== undefined) {
        let lb = lowerBoundUnique(this.data, this.comp, startKey);
        if (
          !isWithinBounds(this.data, lb) ||
          this.comp(this.data[lb].key, startKey) !== 0
        ) {
          lb--;
        }
        if (isWithinBounds(this.data, lb - i)) {
          entry = this.data[lb - i];
        } else {
          return undefined;
        }
      } else {
        entry = this.data[this.data.length - index - 1];
      }
    }

    return [entry.key, entry.val];
  }

  set(k: number, v: number) {
    const lb = lowerBoundUnique(this.data, this.comp, k);
    if (!isWithinBounds(this.data, lb)) {
      this.data.splice(lb, 0, { key: k, val: v });
      return true;
    }
    const elt = this.data[lb];
    if (this.comp(k, elt.key) === 0) {
      elt.val = v;
      return false;
    }
    this.data.splice(lb, 0, { key: k, val: v });
    return true;
  }

  remove(k: number) {
    const lb = lowerBoundUnique(this.data, this.comp, k);
    if (!isWithinBounds(this.data, lb)) {
      return false;
    }
    const elt = this.data[lb];
    if (this.comp(k, elt.key) === 0) {
      this.data.splice(lb, 1);
      return true;
    }
    return false;
  }

  get size() {
    return this.data.length;
  }
}

/**
 * @returns the index of k in the array, or the index to insert k if k is not in the array
 */
function lowerBoundUnique(arr: KV[], comp: TestingComparator, k: number) {
  let min = 0; // inclusive min
  let max = arr.length; // exclusive max
  while (min < max) {
    const i = min + ((max - min) >> 1);
    const c = comp(arr[i].key, k);
    if (c == 0) {
      return i;
    }
    if (c < 0) {
      min = i + 1;
    } else {
      max = i;
    }
  }
  return min;
}
