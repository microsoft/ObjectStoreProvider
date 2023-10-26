/**
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT License.
 * =================================================================
 * Random utils that don't really fit anywhere
 */

export const DEFAULT_COMPARATOR = (a: number, b: number) =>
  a < b ? -1 : a === b ? 0 : 1;
export const REVERSE_COMPARATOR = (a: number, b: number) =>
  a > b ? -1 : a === b ? 0 : 1;

export function isWithinBounds(arr: any[], i: number) {
  return i >= 0 && i < arr.length;
}

export function unreachable() {
  throw new Error("Unreachable");
}

export type TestingComparator = (a: number, b: number) => 1 | 0 | -1;

export interface ISortedTestingMap {
  get(k: number): number | undefined;

  getIndex(
    index: number,
    isReversed: boolean,
    startKey: number,
  ): [number, number] | undefined;

  set(k: number, v: number): boolean;

  remove(k: number): boolean;

  get size(): number;
}
