/**
 * This is an example test file that will be output when the model testing generator
 * detects an issue with the sorted-btree.
 * This test file is not run.
 */

describe("2021-08-05T00-17-40-955Z.spec.js", () => {
  it("should return the expected result", () => {
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
    expect(tree.getIndex(17, false, 48)).toStrictEqual(undefined);
  });
});
