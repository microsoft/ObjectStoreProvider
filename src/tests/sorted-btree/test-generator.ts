/**
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT License.
 * =================================================================
 * Model test the sorted array vs the B Tree.
 * TODO: turn every Math.random() into a reproducible seed
 */
import RBTree from "./sorted-btree-shim";
import SortedArray from "./sorted-array";
import { TestingComparator, REVERSE_COMPARATOR } from "./utils";
import { runOp, findShrunkHistory, HistoryList, Command } from "./shrink";
import { produceRepro } from "./produce-repro-file";

// tuning flags
const NUM_REPEATS = 30;
const NUM_OPS = 10000;
const KEY_RANGES = [10, 100, 1000];
const OUT_OF_BOUNDS_PCT = 10;

function genRandCommand(): Command {
  const ALL_COMMANDS: Command[] = ["GET", "GET_INDEX", "REMOVE", "SET"];
  const i = Math.floor(Math.random() * ALL_COMMANDS.length);
  return ALL_COMMANDS[i];
}

let currentRandomValue = 0;
function genRandVal() {
  currentRandomValue = (currentRandomValue + 1) % NUM_OPS;
  return currentRandomValue;
}

function genRandKey(keyRange: number) {
  // Generate a random number biased towards the low end
  // credit to https://gamedev.stackexchange.com/questions/116832/random-number-in-a-range-biased-toward-the-low-end-of-the-range
  return Math.floor(Math.abs(Math.random() - Math.random()) * keyRange);
}

function genRandBool() {
  return Math.random() < 0.5;
}

function genRandIndex(arrLength: number, outOfBoundsPercentage: number) {
  return Math.floor(
    Math.random() * (arrLength * (1 + outOfBoundsPercentage / 100)),
  );
}

function shrinkAndExit(
  history: HistoryList,
  comp: TestingComparator,
  keyRange: number,
  repeatIdx: number,
) {
  console.log("Attempting to shrink history...");
  const shrunkHistory = findShrunkHistory(history, comp);

  const decreasePct = Number(
    (1 - shrunkHistory.length / history.length) * 100,
  ).toPrecision(2);
  console.log(
    "Minimal repro of size",
    shrunkHistory.length,
    `(${decreasePct}% decrease)`,
  );
  console.log(
    "Details of this failure: keyRange",
    keyRange,
    "- ran",
    repeatIdx + 1,
    "rounds",
  );
  const shouldWriteToFile = process.env.CI !== "true";
  shouldWriteToFile
    ? produceRepro(shrunkHistory, comp, "")
    : produceRepro(shrunkHistory, comp, undefined);
  process.exit(1);
}

// ****************************************************
//             Main function starts here
// ****************************************************

const startTime = process.hrtime();
const comp = REVERSE_COMPARATOR;
for (const keyRange of KEY_RANGES) {
  for (let repeatIdx = 0; repeatIdx < NUM_REPEATS; repeatIdx++) {
    const bTree = new RBTree(comp);
    const sortedArray = new SortedArray(comp);
    const history: HistoryList = [];

    for (let opIdx = 0; opIdx < NUM_OPS; opIdx++) {
      const cmd = genRandCommand();
      const k = genRandKey(keyRange);
      const v = genRandVal();
      const arrIndex = genRandIndex(sortedArray.size, OUT_OF_BOUNDS_PCT);
      const flag = genRandBool();
      history.push([cmd, k, v, arrIndex, flag]);

      if (!runOp(bTree, sortedArray, cmd, k, v, arrIndex, flag)) {
        console.log("Operation failed:", cmd);
        console.log("Size of history:", history.length);
        const detectionTime = process.hrtime(startTime);
        console.log(
          "Repro detection time: %ds %dms",
          detectionTime[0],
          detectionTime[1] / 1000000,
        );
        shrinkAndExit(history, comp, keyRange, repeatIdx);
      }

      // run a GET immediately
      if (!runOp(bTree, sortedArray, "GET", k, v, arrIndex, flag)) {
        console.log("Operation failed:", "GET", k);
        history.push(["GET", k, v, arrIndex, flag]);
        console.log("Size of history:", history.length);
        const detectionTime = process.hrtime(startTime);
        console.log(
          "Repro detection time: %ds %dms",
          detectionTime[0],
          detectionTime[1] / 1000000,
        );
        shrinkAndExit(history, comp, keyRange, repeatIdx);
      }

      // run a SIZE immediately
      if (!runOp(bTree, sortedArray, "SIZE", k, v, arrIndex, flag)) {
        console.log("Operation failed:", "SIZE");
        history.push(["SIZE", k, v, arrIndex, flag]);
        console.log("Size of history:", history.length);
        const detectionTime = process.hrtime(startTime);
        console.log(
          "Repro detection time: %ds %dms",
          detectionTime[0],
          detectionTime[1] / 1000000,
        );
        shrinkAndExit(history, comp, keyRange, repeatIdx);
      }
    }
  }
}
