/**
 * These tests were automatically generated via mutation testing.
 * They were created by introducing a bug in one of the functions in sorted-btree,
 * and then running the sorted btree test generator on them.
 * If the sorted btree test generator generates another issue, it will be saved to the ./sorted-btree/generated/ folder.
 * When that happens, please fix the bug, then add the test to this test file.
 */

import { REVERSE_COMPARATOR } from "./sorted-btree/utils";
import BTree from "./sorted-btree/sorted-btree-shim";
import { assert } from "chai";

describe("Entries test", () => {
  it("test 1", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(70, 36);
    tree.set(17, 40);
    tree.set(40, 41);
    tree.set(57, 56);
    tree.set(53, 77);
    tree.set(27, 109);
    tree.set(44, 124);
    tree.set(33, 129);
    tree.set(35, 145);
    tree.set(14, 154);
    tree.set(8, 156);
    tree.set(18, 157);
    tree.set(85, 161);
    tree.set(80, 166);
    tree.set(6, 167);
    tree.set(12, 168);
    tree.set(26, 178);
    tree.set(46, 179);
    assert.deepEqual(tree.getIndex(17, false, 48), undefined);
  });

  it("test 2", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(42, 30);
    tree.set(64, 35);
    tree.set(19, 38);
    tree.set(51, 53);
    tree.set(45, 57);
    tree.set(14, 62);
    tree.set(26, 63);
    tree.set(5, 66);
    tree.set(0, 84);
    tree.set(7, 85);
    tree.set(1, 87);
    tree.set(13, 90);
    tree.set(4, 92);
    tree.set(86, 94);
    tree.set(20, 106);
    assert.deepEqual(tree.getIndex(14, false, 41), undefined);
  });
});

describe("Findpath tests", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(2, 237);
    tree.set(7, 252);
    tree.set(5, 265);
    tree.set(1, 267);
    tree.set(4, 269);
    assert.deepEqual(tree.getIndex(1, false, 0), undefined);
  });
});

describe("Max Key tests", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(9, 10);
    tree.set(7, 18);
    tree.set(1, 23);
    tree.set(2, 27);
    tree.set(0, 33);
    assert.deepEqual(tree.get(0), 33);
  });
});

describe("remove test", () => {
  it("test 1", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(5, 97);
    tree.set(0, 100);
    tree.set(3, 103);
    tree.set(1, 104);
    tree.set(7, 107);
    tree.remove(0);
    tree.remove(1);
    assert.deepEqual(tree.remove(1), false);
  });
});

describe("Remove test 2", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(5, 14);
    tree.set(1, 21);
    tree.set(6, 36);
    tree.set(0, 38);
    tree.set(3, 39);
    assert.deepEqual(tree.remove(0), true);
  });
});

describe("Remove test 3", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(6, 17);
    tree.set(1, 54);
    tree.set(3, 56);
    tree.set(7, 57);
    tree.set(0, 61);
    assert.deepEqual(tree.remove(7), true);
  });
});

describe("Remove test 4", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(6, 10);
    tree.set(0, 37);
    tree.set(2, 42);
    tree.set(5, 44);
    tree.set(4, 49);
    tree.remove(1);
    assert.deepEqual(tree.set(2, 55), false);
  });
});

describe("remove with iLow being off by one", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(4, 1376);
    tree.set(5, 1383);
    tree.set(8, 1386);
    tree.set(2, 1390);
    tree.set(0, 1391);
    tree.remove(8);
    assert.deepEqual(tree.remove(5), true);
  });
});

describe("remove with merge bug", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(5, 4573);
    tree.set(1, 4575);
    tree.set(3, 4579);
    tree.set(6, 4590);
    tree.set(0, 4600);
    tree.set(4, 4601);
    tree.remove(6);
    assert.deepEqual(tree.remove(5), true);
  });
});

describe("Remove with sibling not pushing children", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(51, 526);
    tree.set(22, 530);
    tree.set(79, 531);
    tree.set(35, 541);
    tree.set(78, 545);
    tree.set(19, 546);
    tree.set(6, 548);
    tree.set(49, 550);
    tree.set(29, 564);
    tree.set(62, 568);
    tree.set(2, 600);
    tree.set(25, 601);
    tree.set(67, 610);
    tree.remove(42);
    tree.remove(4);
    assert.deepEqual(tree.remove(69), false);
  });
});

describe("Remove with no checking children's first key", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(7, 105);
    tree.set(9, 109);
    tree.set(1, 111);
    tree.set(2, 112);
    tree.set(0, 118);
    tree.remove(0);
    tree.remove(2);
    assert.deepEqual(tree.remove(4), false);
  });
});

describe("Remove with off by one error", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(0, 232);
    tree.set(5, 233);
    tree.set(1, 234);
    tree.set(3, 236);
    tree.set(2, 237);
    assert.deepEqual(tree.remove(0), true);
  });
});

describe("Remove with onFound bug", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(2, 3);
    tree.set(1, 8);
    tree.remove(2);
    assert.deepEqual(tree.get(2), undefined);
  });
});

describe("Remove updating size issue 1", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(2, 19);
    tree.remove(2);
    assert.deepEqual(tree.size, 0);
  });
});

describe("Remove updating size issue 2", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(2, 2);
    tree.remove(2);
    assert.deepEqual(tree.size, 0);
  });
});

describe("Set 1", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(7, 207);
    tree.set(8, 266);
    tree.set(0, 323);
    tree.set(3, 326);
    tree.set(1, 328);
    assert.deepEqual(tree.get(1), 328);
  });
});

describe("Set 2", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(2, 28);
    tree.set(7, 33);
    tree.set(1, 36);
    tree.set(0, 37);
    tree.set(8, 39);
    assert.deepEqual(tree.getIndex(3, false, 7), [0, 37]);
  });
});

describe("Set internal error", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(7, 124);
    tree.set(6, 128);
    tree.set(5, 205);
    tree.set(8, 213);
    tree.set(0, 216);
    tree.set(2, 221);
    tree.set(0, 223);
    assert.deepEqual(tree.get(0), 223);
  });
});

describe("Set internal node off by one", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(7, 254);
    tree.set(2, 279);
    tree.set(1, 280);
    tree.set(0, 287);
    tree.set(4, 289);
    tree.set(5, 295);
    tree.set(3, 302);
    assert.deepEqual(tree.get(3), 302);
  });
});

describe("Set internal without setting key", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(9, 96);
    tree.set(2, 104);
    tree.set(5, 106);
    tree.set(3, 111);
    tree.set(4, 112);
    tree.set(0, 115);
    assert.deepEqual(tree.get(0), 115);
  });
});

describe("Set with bug in split right 2", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(10, 85);
    tree.set(16, 89);
    tree.set(3, 91);
    tree.set(67, 100);
    tree.set(6, 101);
    tree.set(32, 105);
    tree.set(12, 108);
    tree.set(1, 109);
    tree.set(26, 117);
    tree.set(44, 118);
    tree.set(23, 121);
    tree.set(20, 122);
    tree.set(7, 125);
    tree.set(52, 126);
    tree.remove(26);
    assert.deepEqual(tree.getIndex(21, true, 12), undefined);
  });
});

describe("Set with bug in split right 3", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(69, 20);
    tree.set(35, 21);
    tree.set(20, 32);
    tree.set(70, 33);
    tree.set(33, 43);
    tree.set(37, 47);
    tree.set(45, 48);
    tree.set(8, 52);
    tree.set(0, 62);
    tree.set(30, 63);
    tree.set(19, 64);
    tree.set(57, 92);
    assert.deepEqual(tree.get(20), 32);
  });
});

describe("Set internal node with bug in split right 3", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(49, 6);
    tree.set(75, 15);
    tree.set(64, 18);
    tree.set(6, 22);
    tree.set(30, 27);
    tree.set(63, 33);
    tree.set(33, 34);
    tree.set(1, 38);
    tree.set(20, 42);
    tree.set(68, 43);
    tree.set(12, 45);
    tree.set(11, 47);
    tree.set(15, 49);
    assert.deepEqual(tree.getIndex(2, true, 1), [11, 47]);
  });
});

describe("Set internal node with bug in taking from sibling 1", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(3, 34);
    tree.set(4, 41);
    tree.set(7, 45);
    tree.set(5, 46);
    tree.set(1, 47);
    tree.set(0, 49);
    assert.deepEqual(tree.set(1, 56), false);
  });
});

describe("Set internal node with error in taking from sibling 2", () => {
  it("should return the expected result", () => {
    const comp = REVERSE_COMPARATOR;
    const tree = new BTree(comp);

    tree.set(1, 140);
    tree.set(7, 147);
    tree.set(4, 155);
    tree.set(3, 159);
    tree.set(2, 168);
    tree.set(0, 173);
    tree.set(2, 176);
    assert.deepEqual(tree.remove(3), true);
  });
});
