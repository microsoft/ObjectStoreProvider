/**
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT License.
 * =================================================================
 *
 * A runner and shrinker for test cases.
 * Implements the algorithm detailed in https://github.com/dubzzz/fast-check/blob/main/documentation/HowItWorks.md#shrinkers
 */

/**
 * The Sorted B Tree shim
 */
import * as _ from "lodash";
import BTree from "./sorted-btree-shim";
import SortedArray from "./sorted-array";
import { ISortedTestingMap, TestingComparator } from "./utils";

export type Command = "GET" | "GET_INDEX" | "SET" | "REMOVE" | "SIZE";

function runOpOnMap(
  map: ISortedTestingMap,
  cmd: Command,
  k: number,
  v: number,
  arrIndex: number,
  flag: boolean
) {
  switch (cmd) {
    case "GET":
      return map.get(k);
    case "GET_INDEX":
      return map.getIndex(arrIndex, flag, k);
    case "SET":
      return map.set(k, v);
    case "REMOVE":
      return map.remove(k);
    case "SIZE":
      return map.size;
  }
}

export function runOp(
  bTree: ISortedTestingMap,
  sortedArray: SortedArray,
  cmd: Command,
  k: number,
  v: number,
  arrIndex: number,
  flag: boolean
) {
  try {
    const bTreeResult = runOpOnMap(bTree, cmd, k, v, arrIndex, flag);
    const sortedArrResult = runOpOnMap(sortedArray, cmd, k, v, arrIndex, flag);
    return _.isEqual(bTreeResult, sortedArrResult);
  } catch {
    // console.error(e);
    return false;
  }
}

export type HistoryList = [Command, number, number, number, boolean][];

export function finalResult(history: HistoryList, comp: TestingComparator) {
  let result;
  const sortedArr = new SortedArray(comp);
  for (const op of history) {
    result = runOpOnMap(sortedArr, ...op);
  }
  return result;
}

function removeIdempotentOperations(history: HistoryList) {
  const idempotentCommands = ["GET", "GET_INDEX", "GET_RANGE"];
  const relevantOperations = history.filter(
    ([cmd]) => !idempotentCommands.includes(cmd)
  );
  const lastOp = _.last(history);
  if (lastOp !== _.last(relevantOperations)) {
    relevantOperations.push(lastOp!);
  }
  return relevantOperations;
}

function doesFailOnHistory(history: HistoryList, comp: TestingComparator) {
  const tree = new BTree(comp);
  const sortedArray = new SortedArray(comp);
  return !history.every((cmdTuple) => runOp(tree, sortedArray, ...cmdTuple));
}

/**
 * The real algorithm
 */
function* shrinkHistory(history: HistoryList): IterableIterator<HistoryList> {
  // boundary condition for recursing.
  if (history.length === 0) {
    return;
  }
  // 1. Shrink the array in half, slowly increasing the length
  for (
    let startPoint = history.length >> 1;
    startPoint > 0;
    startPoint = startPoint >> 1
  ) {
    yield history.slice(startPoint);
  }
  // 2. Keep the first element and recurse.
  for (const h of shrinkHistory(history.slice(1))) {
    yield [history[0], ...h];
  }
}

function runAndShrink(
  history: HistoryList,
  comp: TestingComparator
):
  | { failed: true; history: HistoryList; numChecked: number }
  | { failed: false; numChecked: number } {
  let numChecked = 1;
  if (doesFailOnHistory(history, comp)) {
    for (const smallerHistory of shrinkHistory(history)) {
      const result = runAndShrink(smallerHistory, comp);
      numChecked += result.numChecked;
      if (result.failed) {
        return { ...result, numChecked };
      }
    }
    return { failed: true, history, numChecked };
  }
  return { failed: false, numChecked };
}

export function findShrunkHistory(
  history: HistoryList,
  comp: TestingComparator
) {
  const startTime = process.hrtime();
  const relevantHistory = removeIdempotentOperations(history);
  const shrinkResult = runAndShrink(relevantHistory, comp);
  console.log("Checked", shrinkResult.numChecked, "shrunk histories");
  const endTime = process.hrtime(startTime);
  console.log("Shrink time: %ds %dms", endTime[0], endTime[1] / 1000000);
  if (!shrinkResult.failed) {
    return history;
  }
  return shrinkResult.history;
}
