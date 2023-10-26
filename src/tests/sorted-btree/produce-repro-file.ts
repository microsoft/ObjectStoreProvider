/**
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT License.
 * =================================================================
 * Produces test cases from a given history
 */

const fs = require("fs");
const path = require("path");
import * as _ from "lodash";
import { Command, finalResult, HistoryList } from "./shrink";
import {
  DEFAULT_COMPARATOR,
  TestingComparator,
  REVERSE_COMPARATOR,
} from "./utils";

export function cmdToString(
  cmd: Command,
  k: number,
  v: number,
  arrIndex: number,
  flag: boolean,
) {
  switch (cmd) {
    case "GET":
      return `tree.get(${k})`;
    case "GET_INDEX":
      return `tree.getIndex(${arrIndex}, ${flag}, ${k})`;
    case "SET":
      return `tree.set(${k}, ${v})`;
    case "REMOVE":
      return `tree.remove(${k})`;
    case "SIZE":
      return `tree.size`;
  }
}

const FOUR_INDENT = "    ";

function exceptLast<T>(arr: T[]): T[] {
  return arr.slice(0, arr.length - 1);
}

export function produceRepro(
  history: HistoryList,
  comp: TestingComparator,
  fileName: string | undefined,
) {
  let outFileName = fileName;
  if (fileName === "") {
    // generate a file name
    outFileName = new Date().toISOString().replace(/[:.]/g, "-") + ".spec.js";
  }

  let result = `\
describe("${outFileName}", () => {
  it("should return the expected result", () => {
`;
  if (comp === REVERSE_COMPARATOR) {
    result += FOUR_INDENT + "const comp = REVERSE_COMPARATOR;\n";
  } else if (comp === DEFAULT_COMPARATOR) {
    result += FOUR_INDENT + "const comp = DEFAULT_COMPARATOR;\n";
  } else {
    // !: WARNING: this relies on function.toString working
    result += FOUR_INDENT + `const comp = ${comp.toString()}\n`;
  }
  result += `${FOUR_INDENT}const tree = new BTree(comp);

`;
  for (const historyEntry of exceptLast(history)) {
    result += FOUR_INDENT + cmdToString(...historyEntry) + ";\n";
  }
  // last result will have the "assert"
  result += `${FOUR_INDENT}assert.deepEqual(${cmdToString(
    ..._.last(history)!,
  )}, ${JSON.stringify(finalResult(history, comp))});\n`;
  result += `\
  });
});
`;
  if (fileName !== undefined) {
    // if fileName is given, write to file, else, write to stdout
    console.log("Writing generated test case to " + outFileName);
    fs.writeFileSync(
      path.resolve("./src/tests/sorted-btree/generated", outFileName),
      result,
    );
  } else {
    console.log("\n\n", result);
  }
}
