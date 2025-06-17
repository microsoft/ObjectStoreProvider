// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { assert } from "chai"; // Mocha doesn't work with import * as syntax, hence this hack.
import { find, each, times, values, keys, some, filter } from "lodash";
import {
  KeyComponentType,
  DbSchema,
  DbProvider,
  openListOfProviders,
  QuerySortOrder,
  FullTextTermResolution,
  IDBCloseConnectionPayload,
  OnCloseHandler,
  UpgradeCallback,
} from "../ObjectStoreProvider";

import { InMemoryProvider } from "../InMemoryProvider";
import { IndexedDbProvider } from "../IndexedDbProvider";
import * as IndexedDbProviderModule from "../IndexedDbProvider";

import { serializeValueToOrderableString } from "../ObjectStoreProviderUtils";

type TestObj = { id?: string; val: string };

function openProvider(
  providerName: string,
  schema: DbSchema,
  wipeFirst: boolean,
  handleOnClose?: OnCloseHandler,
  supportsRollback?: boolean,
  upgradeCallback?: UpgradeCallback
) {
  let provider: DbProvider;

  switch (providerName) {
    case "memory-rbtree":
      provider = new InMemoryProvider(
        "red-black-tree",
        supportsRollback,
        undefined,
        () => ({
          usePushForGetRange: false,
          usePrimaryKeyForGetKeysForRange: true,
        })
      );
      break;
    case "memory-btree":
      provider = new InMemoryProvider(
        "b+tree",
        supportsRollback,
        undefined,
        () => ({
          usePushForGetRange: false,
          usePrimaryKeyForGetKeysForRange: true,
        })
      );
      break;
    case "indexeddb":
      provider = new IndexedDbProvider();
      break;
    case "indexeddbfakekeys":
      provider = new IndexedDbProvider(undefined, false);
      break;
    case "indexeddbonclose":
      provider = new IndexedDbProvider(undefined, undefined, handleOnClose);
      break;
    case "indexeddbonupgradehandler":
      provider = new IndexedDbProvider(
        undefined,
        undefined,
        handleOnClose,
        undefined /** logger */,
        upgradeCallback
      );
      break;
    default:
      throw new Error("Provider not found for name: " + providerName);
  }

  const dbName = "test";
  return openListOfProviders([provider], dbName, schema, wipeFirst, false);
}

function sleep(timeMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(void 0);
    }, timeMs);
  });
}

describe("ObjectStoreProvider", function () {
  this.timeout(5 * 60 * 1000);

  let provsToTest: string[];
  provsToTest = ["memory-rbtree", "memory-btree"];
  provsToTest.push(
    "indexeddb",
    "indexeddbfakekeys",
    "indexeddbonclose",
    "indexeddbonupgradehandler"
  );

  it("Number/value/type sorting", () => {
    const pairsToTest = [
      [0, 1],
      [-1, 1],
      [100, 100.1],
      [-123456.789, -123456.78],
      [-123456.789, 0],
      [-123456.789, 123456.789],
      [0.000012345, 8],
      [0.000012345, 0.00002],
      [-0.000012345, 0.000000001],

      [1, Date.now()],
      [new Date(0), new Date(2)],
      [new Date(1), new Date(2)],
      [new Date(-1), new Date(1)],
      [new Date(-2), new Date(-1)],
      [new Date(-2), new Date(0)],

      [1, "hi"],
      [-1, "hi"],
      [Date.now(), "hi"],
      ["hi", "hi2"],
      ["a", "b"],
    ];

    pairsToTest.forEach((pair) => {
      assert(
        serializeValueToOrderableString(pair[0]) <
          serializeValueToOrderableString(pair[1]),
        "failed for pair: " + pair
      );
    });

    try {
      serializeValueToOrderableString([4, 5] as any as KeyComponentType);
      assert(false, "Should reject this key");
    } catch (e) {
      // Should throw -- expecting this result.
    }
  });

  provsToTest.forEach((provName) => {
    describe("Provider: " + provName, () => {
      describe("Delete database", () => {
        if (provName.indexOf("memory") !== -1) {
          xit("Skip delete test for in memory DB", () => {
            //noop
          });
        } else if (provName.indexOf("indexeddb") === 0) {
          it("Deletes the database", (done) => {
            const schema = {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            };
            openProvider(provName, schema, true)
              .then((prov) => {
                // insert some stuff
                return (
                  prov
                    .put("test", { id: "a", val: "b" })
                    //then delete
                    .then(() => prov.deleteDatabase())
                    .catch((e) => prov.close().then(() => Promise.reject(e)))
                );
              })
              .then(() => openProvider(provName, schema, false))
              .then((prov) => {
                return prov
                  .get("test", "a")
                  .then((retVal) => {
                    const ret = retVal as TestObj;
                    // not found
                    assert(!ret);
                  })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });
        } else {
          it("Rejects with an error", (done) => {
            const schema = {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            };
            return openProvider(provName, schema, true)
              .then((prov) => {
                // insert some stuff
                return prov
                  .put("test", { id: "a", val: "b" })
                  .then(() => prov.deleteDatabase())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                //this should not happen
                assert(false, "Should fail");
              })
              .catch(() => {
                // as expected, didn't delete anything
                return openProvider(provName, schema, false).then((prov) =>
                  prov
                    .get("test", "a")
                    .then((retVal) => {
                      const ret = retVal as TestObj;
                      assert.equal(ret.val, "b");
                    })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)))
                );
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });
        }
      });

      describe("Expected database closure", () => {
        if (provName.indexOf("indexeddbonclose") === -1) {
          xit("Skip expected DB closure for in-memory provider", () => {
            // noop
          });
        } else {
          it("logs an expected close event", (done) => {
            // arrange - create schema
            const schema = {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            };

            let checkOnce = false;
            // arrange - spy function
            let handleOnClose = (payload: IDBCloseConnectionPayload) => {
              if (checkOnce) {
                return;
              }
              checkOnce = true;
              assert.equal(
                payload.name,
                "test",
                `expectedHandleOnClose: actual: ${payload.name} `
              );
              assert.equal(
                payload.objectStores,
                "test",
                `expectedHandleOnClose: actual: ${payload.objectStores} `
              );
              assert.equal(
                payload.type,
                "expectedClosure",
                `expectedHandleOnClose: type: actual: ${payload.type}`
              );
            };

            openProvider(provName, schema, true, handleOnClose)
              .then((prov) => prov.close())
              .then(
                () => done(),
                (err) => done(err)
              );
          });
        }
      });

      describe("Unexpected database closure", () => {
        if (provName.indexOf("indexeddbonclose") === -1) {
          xit("Skip unexpected DB closure for in-memory provider", () => {
            // noop
          });
        } else {
          it("fires the onClose event handler", (done) => {
            // arrange - create schema
            const schema = {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            };
            let checkOnce = false;
            // arrange - spy function
            let handleOnClose = (payload: IDBCloseConnectionPayload) => {
              if (checkOnce) {
                return;
              }
              checkOnce = true;
              assert.equal(
                payload.name,
                "test",
                `unexpectedHandleOnClose: actual: ${payload.name} `
              );
              assert.equal(
                payload.objectStores,
                "test",
                `unexpectedHandleOnClose: actual: ${payload.objectStores} `
              );
              assert.equal(
                payload.type,
                "unexpectedClosure",
                `unexpectedHandleOnClose: type: actual: ${payload.type}`
              );
            };

            openProvider(provName, schema, true, handleOnClose)
              .then((prov) => {
                let db = (prov as IndexedDbProvider)["_db"];
                if (db && db.onclose) {
                  db.onclose(new Event("unexpectedClosure"));
                }
                return sleep(5).then(() => prov); // wait for an event tick for the DOM event to be processed
              })
              .then((prov) => prov.close())
              .then(
                () => done(),
                (err) => done(err)
              );
          });
        }
      });

      describe("Data Manipulation", () => {
        // Setter should set the testable parameter on the first param to the value in the second param, and third param to the
        // second index column for compound indexes.
        var tester = (
          prov: DbProvider,
          indexName: string | undefined,
          compound: boolean,
          setter: (obj: any, indexval1: string, indexval2: string) => void
        ) => {
          var putters = [1, 2, 3, 4, 5].map((v) => {
            var obj: TestObj = { val: "val" + v };
            if (indexName) {
              obj.id = "id" + v;
            }
            setter(obj, "indexa" + v, "indexb" + v);
            return prov.put("test", obj);
          });

          return Promise.all(putters).then(() => {
            let formIndex = (i: number, i2: number = i): string | string[] => {
              if (compound) {
                return ["indexa" + i, "indexb" + i2];
              } else {
                return "indexa" + i;
              }
            };

            let t0 = prov
              .getMultiple(
                "test",
                compound ? formIndex(1, 1) : "indexa1",
                indexName
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getMultiple");
                [1].forEach((v) => {
                  assert(
                    find(ret, (r) => r.val === "val" + v),
                    "cant find " + v
                  );
                });
              });

            let t1 = prov.getAll("test", indexName).then((retVal) => {
              const ret = retVal as TestObj[];
              assert.equal(ret.length, 5, "getAll");
              [1, 2, 3, 4, 5].forEach((v) => {
                assert(
                  find(ret, (r) => r.val === "val" + v),
                  "cant find " + v
                );
              });
            });

            let t1count = prov.countAll("test", indexName).then((ret) => {
              assert.equal(ret, 5, "countAll");
            });

            let t1b = prov
              .getAll("test", indexName, false, 3)
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 3, "getAll lim3");
                [1, 2, 3].forEach((v) => {
                  assert(
                    find(ret, (r) => r.val === "val" + v),
                    "cant find " + v
                  );
                });
              });

            let t1c = prov
              .getAll("test", indexName, false, 3, 1)
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 3, "getAll lim3 off1");
                [2, 3, 4].forEach((v) => {
                  assert(
                    find(ret, (r) => r.val === "val" + v),
                    "cant find " + v
                  );
                });
              });

            let t2 = prov
              .getOnly("test", indexName, formIndex(3))
              .then((ret) => {
                assert.equal(ret.length, 1, "getOnly");
                assert.equal((ret[0] as TestObj).val, "val3");
              });

            let t2count = prov
              .countOnly("test", indexName, formIndex(3))
              .then((ret) => {
                assert.equal(ret, 1, "countOnly");
              });

            let t3 = prov
              .getRange("test", indexName, formIndex(2), formIndex(4))
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 3, "getRange++");
                [2, 3, 4].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3count = prov
              .countRange("test", indexName, formIndex(2), formIndex(4))
              .then((ret) => {
                assert.equal(ret, 3, "countRange++");
              });

            let t3b = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                false,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange++ lim1");
                [2].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3b2 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                false,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange++ lim1");
                [2].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3b3 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                QuerySortOrder.Forward,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange++ lim1");
                [2].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3b4 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                QuerySortOrder.Reverse,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange++ lim1 rev");
                [4].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3c = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                false,
                1,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange++ lim1 off1");
                [3].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3d = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                false,
                2,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 2, "getRange++ lim2 off1");
                [3, 4].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3d2 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                QuerySortOrder.Forward,
                2,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 2, "getRange++ lim2 off1");
                [3, 4].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3d3 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                true,
                2,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 2, "getRange++ lim2 off1 rev");
                assert.equal((ret[0] as TestObj).val, "val3");
                [2, 3].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3d4 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                QuerySortOrder.Reverse,
                2,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 2, "getRange++ lim2 off1 rev");
                assert.equal((ret[0] as TestObj).val, "val3");
                [2, 3].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t4 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                true,
                false
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 2, "getRange-+");
                [3, 4].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t4count = prov
              .countRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                true,
                false
              )
              .then((ret) => {
                assert.equal(ret, 2, "countRange-+");
              });

            let t5 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                true
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 2, "getRange+-");
                [2, 3].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t5count = prov
              .countRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                true
              )
              .then((ret) => {
                assert.equal(ret, 2, "countRange+-");
              });

            let t6 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                true,
                true
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange--");
                [3].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t6count = prov
              .countRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                true,
                true
              )
              .then((ret) => {
                assert.equal(ret, 1, "countRange--");
              });

            return Promise.all([
              t0,
              t1,
              t1count,
              t1b,
              t1c,
              t2,
              t2count,
              t3,
              t3count,
              t3b,
              t3b2,
              t3b3,
              t3b4,
              t3c,
              t3d,
              t3d2,
              t3d3,
              t3d4,
              t4,
              t4count,
              t5,
              t5count,
              t6,
              t6count,
            ]).then(() => {
              if (compound) {
                let tt1 = prov
                  .getRange("test", indexName, formIndex(2, 2), formIndex(4, 3))
                  .then((retVal) => {
                    const ret = retVal as TestObj[];
                    assert.equal(ret.length, 2, "getRange2++");
                    [2, 3].forEach((v) => {
                      assert(find(ret, (r) => r.val === "val" + v));
                    });
                  });

                let tt1count = prov
                  .countRange(
                    "test",
                    indexName,
                    formIndex(2, 2),
                    formIndex(4, 3)
                  )
                  .then((ret) => {
                    assert.equal(ret, 2, "countRange2++");
                  });

                let tt2 = prov
                  .getRange(
                    "test",
                    indexName,
                    formIndex(2, 2),
                    formIndex(4, 3),
                    false,
                    true
                  )
                  .then((retVal) => {
                    const ret = retVal as TestObj[];
                    assert.equal(ret.length, 2, "getRange2+-");
                    [2, 3].forEach((v) => {
                      assert(find(ret, (r) => r.val === "val" + v));
                    });
                  });

                let tt2count = prov
                  .countRange(
                    "test",
                    indexName,
                    formIndex(2, 2),
                    formIndex(4, 3),
                    false,
                    true
                  )
                  .then((ret) => {
                    assert.equal(ret, 2, "countRange2+-");
                  });

                let tt3 = prov
                  .getRange(
                    "test",
                    indexName,
                    formIndex(2, 2),
                    formIndex(4, 3),
                    true,
                    false
                  )
                  .then((retVal) => {
                    const ret = retVal as TestObj[];
                    assert.equal(ret.length, 1, "getRange2-+");
                    [3].forEach((v) => {
                      assert(find(ret, (r) => r.val === "val" + v));
                    });
                  });

                let tt3count = prov
                  .countRange(
                    "test",
                    indexName,
                    formIndex(2, 2),
                    formIndex(4, 3),
                    true,
                    false
                  )
                  .then((ret) => {
                    assert.equal(ret, 1, "countRange2-+");
                  });

                return Promise.all([
                  tt1,
                  tt1count,
                  tt2,
                  tt2count,
                  tt3,
                  tt3count,
                ]);
              }
              return Promise.resolve(void 0);
            });
          });
        };

        var nonUniqueTester = (
          prov: DbProvider,
          indexName: string | undefined,
          compound: boolean,
          setter: (obj: any, indexval1: string, indexval2: string) => void
        ) => {
          var putters = [1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5].map((v, idx) => {
            var obj: TestObj = { val: "val" + v };
            if (indexName) {
              obj.id = "id" + (idx + 1);
            }
            setter(obj, "indexa" + v, "indexb" + v);
            return prov.put("test", obj);
          });

          return Promise.all(putters).then(() => {
            let formIndex = (i: number, i2: number = i): string | string[] => {
              if (compound) {
                return ["indexa" + i, "indexb" + i2];
              } else {
                return "indexa" + i;
              }
            };

            let t0 = prov
              .getMultiple(
                "test",
                compound ? formIndex(1, 1) : "indexa1",
                indexName
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 3, "getMultiple");
                [1].forEach((v) => {
                  assert(
                    find(ret, (r) => r.val === "val" + v),
                    "cant find " + v
                  );
                });
              });

            let t1 = prov.getAll("test", indexName).then((retVal) => {
              const ret = retVal as TestObj[];
              assert.equal(ret.length, 12, "getAll");
              [1, 2, 3, 4, 5].forEach((v) => {
                assert(
                  find(ret, (r) => r.val === "val" + v),
                  "cant find " + v
                );
              });
            });

            let t1count = prov.countAll("test", indexName).then((ret) => {
              assert.equal(ret, 12, "countAll");
            });

            let t1b = prov
              .getAll("test", indexName, false, 3)
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 3, "getAll lim3");
                [1].forEach((v) => {
                  assert(
                    filter(ret, (r) => r.val === "val" + v).length === 3,
                    "cant find enough " + v
                  );
                });
              });

            let t1c = prov
              .getAll("test", indexName, false, 3, 1)
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 3, "getAll lim3 off1");
                [2, 3, 4].forEach((v) => {
                  assert(
                    find(ret, (r) => r.id === "id" + v),
                    "cant find id " + v
                  );
                });
              });

            let t2 = prov
              .getOnly("test", indexName, formIndex(3))
              .then((ret) => {
                assert.equal(ret.length, 3, "getOnly");
                assert.equal((ret[0] as TestObj).val, "val3");
                assert.equal((ret[1] as TestObj).val, "val3");
                assert.equal((ret[2] as TestObj).val, "val3");
              });

            let t2count = prov
              .countOnly("test", indexName, formIndex(3))
              .then((ret) => {
                assert.equal(ret, 3, "countOnly");
              });

            let t3 = prov
              .getRange("test", indexName, formIndex(2), formIndex(4))
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 7, "getRange++");
                [4, 5, 6, 7, 8, 9, 10].forEach((v) => {
                  assert(find(ret, (r) => r.id === "id" + v));
                });
              });

            let t3count = prov
              .countRange("test", indexName, formIndex(2), formIndex(4))
              .then((ret) => {
                assert.equal(ret, 7, "countRange++");
              });

            let t3b = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                false,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange++ lim1");
                [2].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3b2 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                false,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange++ lim1");
                [2].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3b3 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                QuerySortOrder.Forward,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange++ lim1");
                [2].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3b4 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                QuerySortOrder.Reverse,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange++ lim1 rev");
                [4].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3c = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                false,
                1,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 1, "getRange++ lim1 off1");
                [5].forEach((v) => {
                  assert(find(ret, (r) => r.id === "id" + v));
                });
              });

            let t3d = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                false,
                2,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 2, "getRange++ lim2 off1");
                [5, 6].forEach((v) => {
                  assert(find(ret, (r) => r.id === "id" + v));
                });
              });

            let t3d2 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                QuerySortOrder.Forward,
                2,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 2, "getRange++ lim2 off1");
                [5, 6].forEach((v) => {
                  assert(find(ret, (r) => r.id === "id" + v));
                });
              });

            let t3d3 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                true,
                2,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 2, "getRange++ lim2 off1 rev");
                assert.equal((ret[0] as TestObj).val, "val4");
                [3, 4].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t3d4 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                false,
                QuerySortOrder.Reverse,
                2,
                1
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 2, "getRange++ lim2 off1 rev");
                assert.equal((ret[0] as TestObj).val, "val4");
                [3, 4].forEach((v) => {
                  assert(find(ret, (r) => r.val === "val" + v));
                });
              });

            let t4 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                true,
                false
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 5, "getRange-+");
                [6, 7, 8, 9, 10].forEach((v) => {
                  assert(find(ret, (r) => r.id === "id" + v));
                });
              });

            let t4count = prov
              .countRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                true,
                false
              )
              .then((ret) => {
                assert.equal(ret, 5, "countRange-+");
              });

            let t5 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                true
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 5, "getRange+-");
                [4, 5, 6, 7, 8].forEach((v) => {
                  assert(find(ret, (r) => r.id === "id" + v));
                });
              });

            let t5count = prov
              .countRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                false,
                true
              )
              .then((ret) => {
                assert.equal(ret, 5, "countRange+-");
              });

            let t6 = prov
              .getRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                true,
                true
              )
              .then((retVal) => {
                const ret = retVal as TestObj[];
                assert.equal(ret.length, 3, "getRange--");
                [6, 7, 8].forEach((v) => {
                  assert(find(ret, (r) => r.id === "id" + v));
                });
              });

            let t6count = prov
              .countRange(
                "test",
                indexName,
                formIndex(2),
                formIndex(4),
                true,
                true
              )
              .then((ret) => {
                assert.equal(ret, 3, "countRange--");
              });

            return Promise.all([
              t0,
              t1,
              t1count,
              t1b,
              t1c,
              t2,
              t2count,
              t3,
              t3count,
              t3b,
              t3b2,
              t3b3,
              t3b4,
              t3c,
              t3d,
              t3d2,
              t3d3,
              t3d4,
              t4,
              t4count,
              t5,
              t5count,
              t6,
              t6count,
            ]).then(() => {
              if (compound) {
                let tt1 = prov
                  .getRange("test", indexName, formIndex(2, 2), formIndex(4, 3))
                  .then((retVal) => {
                    const ret = retVal as TestObj[];
                    assert.equal(ret.length, 2, "getRange2++");
                    [2, 3].forEach((v) => {
                      assert(find(ret, (r) => r.val === "val" + v));
                    });
                  });

                let tt1count = prov
                  .countRange(
                    "test",
                    indexName,
                    formIndex(2, 2),
                    formIndex(4, 3)
                  )
                  .then((ret) => {
                    assert.equal(ret, 2, "countRange2++");
                  });

                let tt2 = prov
                  .getRange(
                    "test",
                    indexName,
                    formIndex(2, 2),
                    formIndex(4, 3),
                    false,
                    true
                  )
                  .then((retVal) => {
                    const ret = retVal as TestObj[];
                    assert.equal(ret.length, 2, "getRange2+-");
                    [2, 3].forEach((v) => {
                      assert(find(ret, (r) => r.val === "val" + v));
                    });
                  });

                let tt2count = prov
                  .countRange(
                    "test",
                    indexName,
                    formIndex(2, 2),
                    formIndex(4, 3),
                    false,
                    true
                  )
                  .then((ret) => {
                    assert.equal(ret, 2, "countRange2+-");
                  });

                let tt3 = prov
                  .getRange(
                    "test",
                    indexName,
                    formIndex(2, 2),
                    formIndex(4, 3),
                    true,
                    false
                  )
                  .then((retVal) => {
                    const ret = retVal as TestObj[];
                    assert.equal(ret.length, 1, "getRange2-+");
                    [3].forEach((v) => {
                      assert(find(ret, (r) => r.val === "val" + v));
                    });
                  });

                let tt3count = prov
                  .countRange(
                    "test",
                    indexName,
                    formIndex(2, 2),
                    formIndex(4, 3),
                    true,
                    false
                  )
                  .then((ret) => {
                    assert.equal(ret, 1, "countRange2-+");
                  });

                return Promise.all([
                  tt1,
                  tt1count,
                  tt2,
                  tt2count,
                  tt3,
                  tt3count,
                ]);
              } else {
                return Promise.resolve(void 0);
              }
            });
          });
        };

        it("Simple primary key put/get/getAll", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put("test", { id: "a", val: "b" })
                .then(() => {
                  return prov.get("test", "a").then((retVal) => {
                    const ret = retVal as TestObj;
                    assert.equal(ret.val, "b");

                    return prov.getAll("test", undefined).then((ret2Val) => {
                      const ret2 = ret2Val as TestObj[];
                      assert.equal(ret2.length, 1);
                      assert.equal(ret2[0].val, "b");
                    });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Putting the same primary key should overwrite", (done) => {
          const objToPut = { id: "a", val: "b" };
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) =>
              prov
                .put("test", objToPut)
                .then(() => (objToPut.val = "c"))
                .then(() => prov.put("test", objToPut))
                .then(() => prov.get("test", "a"))
                .then((retVal) => assert.equal((retVal as TestObj).val, "c"))
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)))
                .then(() => done())
            )
            .catch((e) => done(e));
        });

        it("Putting the same secondary non-unique key should overwrite", (done) => {
          let objToPut = { id: "a", val: "b" };
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                  indexes: [
                    {
                      name: "index",
                      keyPath: "val",
                      unique: false,
                      includeDataInIndex: true,
                    },
                  ],
                },
              ],
            },
            true
          )
            .then((prov) =>
              prov
                .put("test", objToPut)
                // add another item with the same index value
                .then(() => (objToPut = { id: "c", val: "b" }))
                .then(() => prov.put("test", objToPut))
                .then(() => prov.get("test", "a"))
                .then((retVal) => assert.equal((retVal as TestObj).val, "b"))
                .then(() => prov.getOnly("test", "index", "b"))
                // non-unique index should have two items: a and c primary keys
                .then((retVal) => assert.equal((retVal as TestObj[]).length, 2))
                // add another item with the same pk as the first one,
                // it should overwrite the "a" item, but also keep the "c" item in the index
                .then(() => (objToPut = { id: "a", val: "b" }))
                .then(() => prov.put("test", objToPut))
                .then(() => prov.getOnly("test", "index", "b"))
                // non-unique index should still have two items
                .then((retVal) => assert.equal((retVal as TestObj[]).length, 2))
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)))
                .then(() => done())
            )
            .catch((e) => done(e));
        });

        it("Empty gets/puts", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put("test", [])
                .then(() => {
                  return prov.getAll("test", undefined).then((rets) => {
                    assert(!!rets);
                    assert.equal(rets.length, 0);
                    return prov.getMultiple("test", []).then((rets) => {
                      assert(!!rets);
                      assert.equal(rets.length, 0);
                    });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("getMultiple with blank", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put(
                  "test",
                  [1, 3].map((i) => {
                    return { id: "a" + i };
                  })
                )
                .then(() => {
                  return prov
                    .getMultiple("test", ["a1", "a2", "a3"])
                    .then((rets) => {
                      assert(!!rets);
                      assert.equal(rets.length, 2);
                    });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Removing items", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put(
                  "test",
                  [1, 2, 3, 4, 5].map((i) => {
                    return { id: "a" + i };
                  })
                )
                .then(() => {
                  return prov.getAll("test", undefined).then((rets) => {
                    assert(!!rets);
                    assert.equal(rets.length, 5);
                    return prov.remove("test", "a1").then(() => {
                      return prov.getAll("test", undefined).then((rets) => {
                        assert(!!rets);
                        assert.equal(rets.length, 4);
                        return prov
                          .remove("test", ["a3", "a4", "a2"])
                          .then(() => {
                            return prov
                              .getAll("test", undefined)
                              .then((retVals) => {
                                const rets = retVals as TestObj[];
                                assert(!!rets);
                                assert.equal(rets.length, 1);
                                assert.equal(rets[0].id, "a5");
                              });
                          });
                      });
                    });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Remove range (inclusive low/high)", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put(
                  "test",
                  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
                    return { id: "a" + i };
                  })
                )
                .then(() => {
                  return prov.getAll("test", undefined).then((rets) => {
                    assert(!!rets);
                    assert.equal(rets.length, 10);
                    return prov.removeRange("test", "", "a3", "a7").then(() => {
                      return prov.getAll("test", undefined).then((retVals) => {
                        const rets = retVals as TestObj[];
                        assert(!!rets);
                        assert.equal(rets.length, 5);
                        assert.equal(rets[0].id, "a1");
                        assert.equal(rets[1].id, "a10");
                        assert.equal(rets[2].id, "a2");
                        assert.equal(rets[3].id, "a8");
                        assert.equal(rets[4].id, "a9");
                      });
                    });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Remove range (exclusive low, inclusive high)", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put(
                  "test",
                  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
                    return { id: "a" + i };
                  })
                )
                .then(() => {
                  return prov.getAll("test", undefined).then((rets) => {
                    assert(!!rets);
                    assert.equal(rets.length, 10);
                    return prov
                      .removeRange("test", "", "a3", "a7", true, false)
                      .then(() => {
                        return prov
                          .getAll("test", undefined)
                          .then((retVals) => {
                            const rets = retVals as TestObj[];
                            assert(!!rets);
                            assert.equal(rets.length, 6);
                            assert.equal(rets[0].id, "a1");
                            assert.equal(rets[1].id, "a10");
                            assert.equal(rets[2].id, "a2");
                            assert.equal(rets[3].id, "a3");
                            assert.equal(rets[4].id, "a8");
                            assert.equal(rets[5].id, "a9");
                          });
                      });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Remove range (inclusive low, exclusive high)", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put(
                  "test",
                  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
                    return { id: "a" + i };
                  })
                )
                .then(() => {
                  return prov.getAll("test", undefined).then((rets) => {
                    assert(!!rets);
                    assert.equal(rets.length, 10);
                    return prov
                      .removeRange("test", "", "a3", "a7", false, true)
                      .then(() => {
                        return prov
                          .getAll("test", undefined)
                          .then((retVals) => {
                            const rets = retVals as TestObj[];
                            assert(!!rets);
                            assert.equal(rets.length, 6);
                            assert.equal(rets[0].id, "a1");
                            assert.equal(rets[1].id, "a10");
                            assert.equal(rets[2].id, "a2");
                            assert.equal(rets[3].id, "a7");
                            assert.equal(rets[4].id, "a8");
                            assert.equal(rets[5].id, "a9");
                          });
                      });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Remove range (exclusive low, exclusive high)", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put(
                  "test",
                  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
                    return { id: "a" + i };
                  })
                )
                .then(() => {
                  return prov.getAll("test", undefined).then((rets) => {
                    assert(!!rets);
                    assert.equal(rets.length, 10);
                    return prov
                      .removeRange("test", "", "a3", "a7", true, true)
                      .then(() => {
                        return prov
                          .getAll("test", undefined)
                          .then((retVals) => {
                            const rets = retVals as TestObj[];
                            assert(!!rets);
                            assert.equal(rets.length, 7);
                            assert.equal(rets[0].id, "a1");
                            assert.equal(rets[1].id, "a10");
                            assert.equal(rets[2].id, "a2");
                            assert.equal(rets[3].id, "a3");
                            assert.equal(rets[4].id, "a7");
                            assert.equal(rets[5].id, "a8");
                            assert.equal(rets[6].id, "a9");
                          });
                      });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Remove range (nothing done)", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put(
                  "test",
                  [1, 2, 3, 4, 5].map((i) => {
                    return { id: "a" + i };
                  })
                )
                .then(() => {
                  return prov.getAll("test", undefined).then((rets) => {
                    assert(!!rets);
                    assert.equal(rets.length, 5);
                    return prov.removeRange("test", "", "a6", "a9").then(() => {
                      return prov.getAll("test", undefined).then((retVals) => {
                        const rets = retVals as TestObj[];
                        assert(!!rets);
                        assert.equal(rets.length, 5);
                        assert.equal(rets[0].id, "a1");
                        assert.equal(rets[1].id, "a2");
                        assert.equal(rets[2].id, "a3");
                        assert.equal(rets[3].id, "a4");
                        assert.equal(rets[4].id, "a5");
                      });
                    });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Remove range (all removed)", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put(
                  "test",
                  [1, 2, 3, 4, 5].map((i) => {
                    return { id: "a" + i };
                  })
                )
                .then(() => {
                  return prov.getAll("test", undefined).then((rets) => {
                    assert(!!rets);
                    assert.equal(rets.length, 5);
                    return prov.removeRange("test", "", "a1", "a5").then(() => {
                      return prov.getAll("test", undefined).then((retVals) => {
                        const rets = retVals as TestObj[];
                        assert(!!rets);
                        assert.equal(rets.length, 0);
                      });
                    });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Remove range (all removed with index)", (done) => {
          // Not working with index, need to be fix in the future.
          if (provName === "indexeddbfakekeys") {
            done();
            return;
          }

          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                  indexes: [
                    {
                      name: "index",
                      keyPath: "a",
                    },
                  ],
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put(
                  "test",
                  [1, 2, 3, 4, 5].map((i) => {
                    return { id: "a" + i, a: "index_value_a_" + i };
                  })
                )
                .then(() => {
                  return prov.getAll("test", undefined).then((rets) => {
                    assert(!!rets);
                    assert.equal(rets.length, 5);
                    return prov
                      .removeRange(
                        "test",
                        "index",
                        "index_value_a_1",
                        "index_value_a_5"
                      )
                      .then(() => {
                        return prov
                          .getAll("test", undefined)
                          .then((retVals) => {
                            const rets = retVals as TestObj[];
                            assert(!!rets);
                            assert.equal(rets.length, 0);
                          });
                      });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Remove range (all removed with index not unique)", (done) => {
          // Not working with index, need to be fix in the future.
          if (provName === "indexeddbfakekeys") {
            done();
            return;
          }

          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                  indexes: [
                    {
                      name: "index",
                      keyPath: "a",
                      unique: false,
                    },
                  ],
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put(
                  "test",
                  [1, 1, 2, 3, 4, 5].map((i, index) => {
                    return {
                      id: index,
                      a: "index_value_a_" + i,
                    };
                  })
                )
                .then(() => {
                  return prov.getAll("test", undefined).then((rets) => {
                    assert(!!rets);
                    assert.equal(rets.length, 6);
                    return prov
                      .removeRange(
                        "test",
                        "index",
                        "index_value_a_1",
                        "index_value_a_5"
                      )
                      .then(() => {
                        return prov
                          .getAll("test", undefined)
                          .then((retVals) => {
                            const rets = retVals as TestObj[];
                            assert(!!rets);
                            assert.equal(rets.length, 0);
                          });
                      });
                  });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Invalid Key Type", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put("test", { id: { x: "a" }, val: "b" })
                .then(
                  () => {
                    return prov
                      .close()
                      .then(() => assert(false, "Shouldn't get here"));
                  },
                  () => {
                    // Woot, failed like it's supposed to
                    return prov.close();
                  }
                )
                .then(() => {
                  done();
                });
            })
            .catch((err) => {
              done(err);
            });
        });

        it("Primary Key Basic KeyPath", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return tester(prov, undefined, false, (obj, v) => {
                obj.id = v;
              })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        for (let i = 0; i <= 1; i++) {
          it(
            "Simple index put/get, getAll, getOnly, and getRange" +
              (i === 0 ? "" : " (includeData)"),
            (done) => {
              openProvider(
                provName,
                {
                  version: 1,
                  stores: [
                    {
                      name: "test",
                      primaryKeyPath: "id",
                      indexes: [
                        {
                          name: "index",
                          keyPath: "a",
                          includeDataInIndex: i === 1,
                        },
                      ],
                    },
                  ],
                },
                true
              )
                .then((prov) => {
                  return tester(prov, "index", false, (obj, v) => {
                    obj.a = v;
                  })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                })
                .then(
                  () => done(),
                  (err) => done(err)
                );
            }
          );
        }

        it("Multipart primary key basic test", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "a.b",
                },
              ],
            },
            true
          )
            .then((prov) => {
              return tester(prov, undefined, false, (obj, v) => {
                obj.a = { b: v };
              })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Multipart index basic test", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                  indexes: [
                    {
                      name: "index",
                      keyPath: "a.b",
                    },
                  ],
                },
              ],
            },
            true
          )
            .then((prov) => {
              return tester(prov, "index", false, (obj, v) => {
                obj.a = { b: v };
              })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Compound primary key basic test", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: ["a", "b"],
                },
              ],
            },
            true
          )
            .then((prov) => {
              return tester(prov, undefined, true, (obj, v1, v2) => {
                obj.a = v1;
                obj.b = v2;
              })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Compound index basic test", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                  indexes: [
                    {
                      name: "index",
                      keyPath: ["a", "b"],
                    },
                  ],
                },
              ],
            },
            true
          )
            .then((prov) => {
              return tester(prov, "index", true, (obj, v1, v2) => {
                obj.a = v1;
                obj.b = v2;
              })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        for (let i = 0; i <= 1; i++) {
          it(
            "MultiEntry multipart indexed tests" +
              (i === 0 ? "" : " (includeData)"),
            (done) => {
              openProvider(
                provName,
                {
                  version: 1,
                  stores: [
                    {
                      name: "test",
                      primaryKeyPath: "id",
                      indexes: [
                        {
                          name: "key",
                          multiEntry: true,
                          keyPath: "k.k",
                          includeDataInIndex: i === 1,
                        },
                      ],
                    },
                  ],
                },
                true
              )
                .then((prov) => {
                  return (
                    prov
                      .put("test", {
                        id: "a",
                        val: "b",
                        k: { k: ["w", "x", "y", "z"] },
                      })
                      // Insert data without multi-entry key defined
                      .then(() =>
                        prov.put("test", { id: "c", val: "d", k: [] })
                      )
                      .then(() => prov.put("test", { id: "e", val: "f" }))
                      .then(() => {
                        var g1 = prov.get("test", "a").then((retVal) => {
                          const ret = retVal as TestObj;
                          assert.equal(ret.val, "b");
                        });
                        var g2 = prov.getAll("test", "key").then((retVal) => {
                          const ret = retVal as TestObj[];
                          assert.equal(ret.length, 4);
                          ret.forEach((r) => {
                            assert.equal(r.val, "b");
                          });
                        });
                        var g2b = prov
                          .getAll("test", "key", false, 2)
                          .then((retVal) => {
                            const ret = retVal as TestObj[];
                            assert.equal(ret.length, 2);
                            ret.forEach((r) => {
                              assert.equal(r.val, "b");
                            });
                          });
                        var g2c = prov
                          .getAll("test", "key", false, 2, 1)
                          .then((retVal) => {
                            const ret = retVal as TestObj[];
                            assert.equal(ret.length, 2);
                            ret.forEach((r) => {
                              assert.equal(r.val, "b");
                            });
                          });
                        var g3 = prov
                          .getOnly("test", "key", "x")
                          .then((retVal) => {
                            const ret = retVal as TestObj[];
                            assert.equal(ret.length, 1);
                            assert.equal(ret[0].val, "b");
                          });
                        var g4 = prov
                          .getRange("test", "key", "x", "y", false, false)
                          .then((retVal) => {
                            const ret = retVal as TestObj[];
                            assert.equal(ret.length, 2);
                            ret.forEach((r) => {
                              assert.equal(r.val, "b");
                            });
                          });
                        return Promise.all([g1, g2, g2b, g2c, g3, g4]);
                      })
                      .then(() => prov.close())
                      .catch((e) => prov.close().then(() => Promise.reject(e)))
                  );
                })
                .then(
                  () => done(),
                  (err) => done(err)
                );
            }
          );
        }

        it("MultiEntry multipart indexed - update index", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                  indexes: [
                    {
                      name: "key",
                      multiEntry: true,
                      keyPath: "k.k",
                    },
                  ],
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put("test", {
                  id: "a",
                  val: "b",
                  k: { k: ["w", "x", "y", "z"] },
                })
                .then(() => {
                  return prov
                    .getRange("test", "key", "x", "y", false, false)
                    .then((retVal) => {
                      const ret = retVal as TestObj[];
                      assert.equal(ret.length, 2);
                      ret.forEach((r) => {
                        assert.equal(r.val, "b");
                      });
                    });
                })
                .then(() => {
                  return prov.put("test", {
                    id: "a",
                    val: "b",
                    k: { k: ["z"] },
                  });
                })
                .then(() => {
                  return prov
                    .getRange("test", "key", "x", "y", false, false)
                    .then((ret) => {
                      assert.equal(ret.length, 0);
                    });
                })
                .then(() => {
                  return prov
                    .getRange("test", "key", "x", "z", false, false)
                    .then((retVal) => {
                      const ret = retVal as TestObj[];
                      assert.equal(ret.length, 1);
                      assert.equal(ret[0].val, "b");
                    });
                })
                .then(() => {
                  return prov.remove("test", "a");
                })
                .then(() => {
                  return prov
                    .getRange("test", "key", "x", "z", false, false)
                    .then((ret) => {
                      assert.equal(ret.length, 0);
                    });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("MultiEntry multipart indexed tests - getMultiple", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                  indexes: [
                    {
                      name: "key",
                      multiEntry: true,
                      keyPath: "k.k",
                    },
                  ],
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put("test", {
                  id: "a",
                  id2: "1",
                  val: "b",
                  k: { k: ["w", "x", "y", "z"] },
                })
                .then(() => {
                  var g = prov
                    .getMultiple("test", ["x", "y"], "key")
                    .then((retVal) => {
                      const ret = retVal as TestObj[];
                      assert.equal(ret.length, 2);
                      ret.forEach((r) => {
                        assert.equal(r.val, "b");
                      });
                    });
                  var g1 = prov
                    .getMultiple("test", ["lala"], "key")
                    .then((retVal) => {
                      const ret = retVal as TestObj[];
                      assert.equal(ret.length, 0);
                    });
                  return Promise.all([g, g1]);
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("MultiEntry multipart indexed tests - Compound Key", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: ["id", "id2"],
                  indexes: [
                    {
                      name: "key",
                      multiEntry: true,
                      keyPath: "k.k",
                    },
                  ],
                },
              ],
            },
            true
          )
            .then((prov) => {
              return (
                prov
                  .put("test", {
                    id: "a",
                    id2: "1",
                    val: "b",
                    k: { k: ["w", "x", "y", "z"] },
                  })
                  // Insert data without multi-entry key defined
                  .then(() =>
                    prov.put("test", { id: "c", id2: "2", val: "d", k: [] })
                  )
                  .then(() => prov.put("test", { id: "e", id2: "3", val: "f" }))
                  .then(() => {
                    var g1 = prov.get("test", ["a", "1"]).then((retVal) => {
                      const ret = retVal as TestObj;
                      assert.equal(ret.val, "b");
                    });
                    var g2 = prov.getAll("test", "key").then((retVal) => {
                      const ret = retVal as TestObj[];
                      assert.equal(ret.length, 4);
                      ret.forEach((r) => {
                        assert.equal(r.val, "b");
                      });
                    });
                    var g2b = prov
                      .getAll("test", "key", false, 2)
                      .then((retVal) => {
                        const ret = retVal as TestObj[];
                        assert.equal(ret.length, 2);
                        ret.forEach((r) => {
                          assert.equal(r.val, "b");
                        });
                      });
                    var g2c = prov
                      .getAll("test", "key", false, 2, 1)
                      .then((retVal) => {
                        const ret = retVal as TestObj[];
                        assert.equal(ret.length, 2);
                        ret.forEach((r) => {
                          assert.equal(r.val, "b");
                        });
                      });
                    var g3 = prov.getOnly("test", "key", "x").then((retVal) => {
                      const ret = retVal as TestObj[];
                      assert.equal(ret.length, 1);
                      assert.equal(ret[0].val, "b");
                    });
                    var g4 = prov
                      .getRange("test", "key", "x", "y", false, false)
                      .then((retVal) => {
                        const ret = retVal as TestObj[];
                        assert.equal(ret.length, 2);
                        ret.forEach((r) => {
                          assert.equal(r.val, "b");
                        });
                      });
                    return Promise.all([g1, g2, g2b, g2c, g3, g4]);
                  })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)))
              );
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("MultiEntry multipart indexed - update index - Compound", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: ["id", "id2"],
                  indexes: [
                    {
                      name: "key",
                      multiEntry: true,
                      keyPath: "k.k",
                    },
                  ],
                },
              ],
            },
            true
          )
            .then((prov) => {
              return prov
                .put("test", {
                  id: "a",
                  id2: "1",
                  val: "b",
                  k: { k: ["w", "x", "y", "z"] },
                })
                .then(() => {
                  return prov
                    .getRange("test", "key", "x", "y", false, false)
                    .then((retVal) => {
                      const ret = retVal as TestObj[];
                      assert.equal(ret.length, 2);
                      ret.forEach((r) => {
                        assert.equal(r.val, "b");
                      });
                    });
                })
                .then(() => {
                  return prov.put("test", {
                    id: "a",
                    id2: "1",
                    val: "b",
                    k: { k: ["z"] },
                  });
                })
                .then(() => {
                  return prov
                    .getRange("test", "key", "x", "y", false, false)
                    .then((retVal) => {
                      const ret = retVal as TestObj[];
                      assert.equal(ret.length, 0);
                    });
                })
                .then(() => {
                  return prov
                    .getRange("test", "key", "x", "z", false, false)
                    .then((retVal) => {
                      const ret = retVal as TestObj[];
                      assert.equal(ret.length, 1);
                      assert.equal(ret[0].val, "b");
                    });
                })
                .then(() => {
                  return prov.remove("test", ["a", "1"]);
                })
                .then(() => {
                  return prov
                    .getRange("test", "key", "x", "z", false, false)
                    .then((retVal) => {
                      const ret = retVal as TestObj[];
                      assert.equal(ret.length, 0);
                    });
                })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        it("Simple non-unique index put/get, getAll, getOnly, and getRange (includeData)", (done) => {
          openProvider(
            provName,
            {
              version: 1,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                  indexes: [
                    {
                      name: "index",
                      keyPath: "a",
                      unique: false,
                      includeDataInIndex: true,
                    },
                  ],
                },
              ],
            },
            true
          )
            .then((prov) => {
              return nonUniqueTester(prov, "index", false, (obj, v) => {
                obj.a = v;
              })
                .then(() => prov.close())
                .catch((e) => prov.close().then(() => Promise.reject(e)));
            })
            .then(
              () => done(),
              (err) => done(err)
            );
        });

        describe("Transaction Semantics", () => {
          it("Testing transaction expiration", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .openTransaction(["test"], true)
                  .then((trans) => {
                    let promise = trans.getCompletionPromise();
                    let check1 = false;
                    promise.then(
                      () => {
                        check1 = true;
                      },
                      () => {
                        assert.ok(false, "Bad");
                      }
                    );
                    return sleep(200).then(() => {
                      assert.ok(check1);
                      const store = trans.getStore("test");
                      return store.put({ id: "abc", a: "a" });
                    });
                  })
                  .then(
                    () => {
                      assert.ok(false, "Should fail");
                      return Promise.reject<void>();
                    },
                    () => {
                      // woot
                      return undefined;
                    }
                  )
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Testing aborting", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true,
              undefined,
              true
            )
              .then((prov) => {
                let checked = false;
                return prov
                  .openTransaction(["test"], true)
                  .then((trans) => {
                    let promise = trans.getCompletionPromise();
                    const store = trans.getStore("test");
                    return store.put({ id: "abc", a: "a" }).then(() => {
                      trans.abort();
                      return promise.then(
                        () => {
                          assert.ok(false, "Should fail");
                        },
                        () => {
                          return prov.get("test", "abc").then((res) => {
                            assert.ok(!res);
                            checked = true;
                          });
                        }
                      );
                    });
                  })
                  .then(() => {
                    assert.ok(checked);
                  })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                done();
              });
          });

          it("Testing read/write transaction locks", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", a: "a" })
                  .then(() => {
                    let check1 = false,
                      check2 = false;
                    let started1 = false;
                    let closed1 = false;
                    const p1 = prov
                      .openTransaction(["test"], true)
                      .then((trans) => {
                        trans.getCompletionPromise().then(() => {
                          closed1 = true;
                        });
                        started1 = true;
                        const store = trans.getStore("test");
                        return store.put({ id: "abc", a: "b" }).then(() => {
                          return store.get("abc").then((val: any) => {
                            assert.ok(val && val.a === "b");
                            assert.ok(!closed1);
                            check1 = true;
                          });
                        });
                      });
                    assert.ok(!closed1);
                    const p2 = prov
                      .openTransaction(["test"], false)
                      .then((trans) => {
                        assert.ok(closed1);
                        assert.ok(started1 && check1);
                        const store = trans.getStore("test");
                        return store.get("abc").then((val: any) => {
                          assert.ok(val && val.a === "b");
                          check2 = true;
                        });
                      });
                    return Promise.all([p1, p2]).then(() => {
                      assert.ok(check1 && check2);
                    });
                  })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });
        });
      });

      if (provName.indexOf("memory") === -1) {
        describe("Schema Upgrades", () => {
          it("Opening an older DB version", (done) => {
            openProvider(
              provName,
              {
                version: 2,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov.close();
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 1,
                    stores: [
                      {
                        name: "test2",
                        primaryKeyPath: "id",
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  return prov.get("test", "abc").then(
                    () => {
                      return prov.close().then(() => {
                        return Promise.reject<void>("Shouldn't have worked");
                      });
                    },
                    () => {
                      // Expected to fail, so chain from failure to success
                      return prov.close();
                    }
                  );
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Basic NOOP schema upgrade path", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  return prov
                    .get("test", "abc")
                    .then((item) => {
                      assert(!!item);
                    })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Adding new store", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                      },
                      {
                        name: "test2",
                        primaryKeyPath: "ttt",
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  return prov
                    .put("test2", { id: "def", ttt: "ghi" })
                    .then(() => {
                      const p1 = prov.get("test", "abc").then((itemVal) => {
                        const item = itemVal as TestObj;
                        assert(!!item);
                        assert.equal(item.id, "abc");
                      });
                      const p2 = prov.get("test2", "abc").then((item) => {
                        assert(!item);
                      });
                      const p3 = prov.get("test2", "def").then((item) => {
                        assert(!item);
                      });
                      const p4 = prov.get("test2", "ghi").then((itemVal) => {
                        const item = itemVal as TestObj;
                        assert(!!item);
                        assert.equal(item.id, "def");
                      });
                      return Promise.all([p1, p2, p3, p4]);
                    })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Removing old store", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test2",
                        primaryKeyPath: "id",
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  return prov.get("test", "abc").then(
                    () => {
                      return prov.close().then(() => {
                        return Promise.reject<void>("Shouldn't have worked");
                      });
                    },
                    () => {
                      // Expected to fail, so chain from failure to success
                      return prov.close();
                    }
                  );
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Remove store with index", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                    indexes: [
                      {
                        name: "ind1",
                        keyPath: "tt",
                      },
                    ],
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", tt: "abc" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test2",
                        primaryKeyPath: "id",
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  return prov.get("test", "abc").then(
                    () => {
                      return prov.close().then(() => {
                        return Promise.reject<void>("Shouldn't have worked");
                      });
                    },
                    () => {
                      // Expected to fail, so chain from failure to success
                      return prov.close();
                    }
                  );
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Add index", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", tt: "a" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                        indexes: [
                          {
                            name: "ind1",
                            keyPath: "tt",
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  const p1 = prov
                    .getOnly("test", "ind1", "a")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                      assert.equal(items[0].tt, "a");
                    });
                  const p2 = prov
                    .getOnly("test", undefined, "abc")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                      assert.equal(items[0].tt, "a");
                    });
                  const p3 = prov
                    .getOnly("test", "ind1", "abc")
                    .then((items) => {
                      assert.equal(items.length, 0);
                    });
                  return Promise.all([p1, p2, p3])
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          function testBatchUpgrade(itemByteSize: number): Promise<void> {
            const recordCount = 5000;
            const data: { [id: string]: { id: string; tt: string } } = {};
            times(recordCount, (num) => {
              data[num.toString()] = {
                id: num.toString(),
                tt: "tt" + num.toString(),
              };
            });
            return openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                    estimatedObjBytes: itemByteSize,
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", values(data))
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                        estimatedObjBytes: itemByteSize,
                        indexes: [
                          {
                            name: "ind1",
                            keyPath: "tt",
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  return prov
                    .getAll("test", undefined)
                    .then((records: any) => {
                      assert.equal(
                        records.length,
                        keys(data).length,
                        "Incorrect record count"
                      );
                      each(records, (dbRecordToValidate) => {
                        const originalRecord = data[dbRecordToValidate.id];
                        assert.ok(!!originalRecord);
                        assert.equal(originalRecord.id, dbRecordToValidate.id);
                        assert.equal(originalRecord.tt, dbRecordToValidate.tt);
                      });
                    })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              });
          }

          it("Add index - Large records - batched upgrade", (done) => {
            testBatchUpgrade(10000).then(
              () => done(),
              (err) => done(err)
            );
          });

          it("Add index - small records - No batch upgrade", (done) => {
            testBatchUpgrade(1).then(
              () => done(),
              (err) => done(err)
            );
          });

          if (provName.indexOf("indexeddb") !== 0) {
            // This migration works on indexeddb because we don't check the types and the browsers silently accept it but just
            // neglect to index the field...
            it("Add index to boolean field should fail", (done) => {
              openProvider(
                provName,
                {
                  version: 1,
                  stores: [
                    {
                      name: "test",
                      primaryKeyPath: "id",
                    },
                  ],
                },
                true
              )
                .then((prov) => {
                  return prov
                    .put("test", { id: "abc", tt: true })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                })
                .then(() => {
                  return openProvider(
                    provName,
                    {
                      version: 2,
                      stores: [
                        {
                          name: "test",
                          primaryKeyPath: "id",
                          indexes: [
                            {
                              name: "ind1",
                              keyPath: "tt",
                            },
                          ],
                        },
                      ],
                    },
                    false
                  ).then(
                    (prov) => {
                      return prov
                        .close()
                        .then(() => Promise.reject("Should not work"));
                    },
                    () => {
                      return Promise.resolve();
                    }
                  );
                })
                .then(
                  () => done(),
                  (err) => done(err)
                );
            });
          }

          it("Add multiEntry index", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", tt: ["a", "b"] })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                        indexes: [
                          {
                            name: "ind1",
                            keyPath: "tt",
                            multiEntry: true,
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  const p1 = prov
                    .getOnly("test", "ind1", "a")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p1b = prov
                    .getOnly("test", "ind1", "b")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p2 = prov
                    .getOnly("test", undefined, "abc")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p3 = prov
                    .getOnly("test", "ind1", "abc")
                    .then((items) => {
                      assert.equal(items.length, 0);
                    });
                  return Promise.all([p1, p1b, p2, p3])
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Changing multiEntry index", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                    indexes: [
                      {
                        name: "ind1",
                        keyPath: "tt",
                        multiEntry: true,
                      },
                    ],
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", tt: ["x", "y"], ttb: ["a", "b"] })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                        indexes: [
                          {
                            name: "ind1",
                            keyPath: "ttb",
                            multiEntry: true,
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  const p1 = prov
                    .getOnly("test", "ind1", "a")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p1b = prov
                    .getOnly("test", "ind1", "b")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p1c = prov
                    .getOnly("test", "ind1", "x")
                    .then((items) => {
                      assert.equal(items.length, 0);
                    });
                  const p2 = prov
                    .getOnly("test", undefined, "abc")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p3 = prov
                    .getOnly("test", "ind1", "abc")
                    .then((items) => {
                      assert.equal(items.length, 0);
                    });
                  return Promise.all([p1, p1b, p1c, p2, p3])
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Removing old index", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                    indexes: [
                      {
                        name: "ind1",
                        keyPath: "tt",
                      },
                    ],
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", tt: "a" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  return prov.getOnly("test", "ind1", "a").then(
                    () => {
                      return prov.close().then(() => {
                        return Promise.reject<void>("Shouldn't have worked");
                      });
                    },
                    () => {
                      // Expected to fail, so chain from failure to success
                      return prov.close();
                    }
                  );
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Changing index keypath", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                    indexes: [
                      {
                        name: "ind1",
                        keyPath: "tt",
                      },
                    ],
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", tt: "a", ttb: "b" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                        indexes: [
                          {
                            name: "ind1",
                            keyPath: "ttb",
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  const p1 = prov.getOnly("test", "ind1", "a").then((items) => {
                    assert.equal(items.length, 0);
                  });
                  const p2 = prov
                    .getOnly("test", "ind1", "b")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].ttb, "b");
                    });
                  const p3 = prov
                    .getOnly("test", "ind1", "abc")
                    .then((items) => {
                      assert.equal(items.length, 0);
                    });
                  return Promise.all([p1, p2, p3])
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Change non-multientry index to includeDataInIndex", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                    indexes: [
                      {
                        name: "ind1",
                        keyPath: "tt",
                      },
                    ],
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov.put("test", { id: "abc", tt: "a" }).then(() => {
                  return prov.close();
                });
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                        indexes: [
                          {
                            name: "ind1",
                            keyPath: "tt",
                            includeDataInIndex: true,
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  const p1 = prov
                    .getOnly("test", "ind1", "a")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                      assert.equal(items[0].tt, "a");
                    });
                  const p2 = prov
                    .getOnly("test", undefined, "abc")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                      assert.equal(items[0].tt, "a");
                    });
                  const p3 = prov
                    .getOnly("test", "ind1", "abc")
                    .then((items) => {
                      assert.equal(items.length, 0);
                    });
                  return Promise.all([p1, p2, p3])
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Change non-multientry index from includeDataInIndex", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                    indexes: [
                      {
                        name: "ind1",
                        keyPath: "tt",
                        includeDataInIndex: true,
                      },
                    ],
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", tt: "a" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                        indexes: [
                          {
                            name: "ind1",
                            keyPath: "tt",
                            includeDataInIndex: false,
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  const p1 = prov
                    .getOnly("test", "ind1", "a")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                      assert.equal(items[0].tt, "a");
                    });
                  const p2 = prov
                    .getOnly("test", undefined, "abc")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                      assert.equal(items[0].tt, "a");
                    });
                  const p3 = prov
                    .getOnly("test", "ind1", "abc")
                    .then((items) => {
                      assert.equal(items.length, 0);
                    });
                  return Promise.all([p1, p2, p3])
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Change multientry index to includeDataInIndex", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                    indexes: [
                      {
                        name: "ind1",
                        keyPath: "tt",
                        multiEntry: true,
                      },
                    ],
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", tt: ["a", "b"] })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                        indexes: [
                          {
                            name: "ind1",
                            keyPath: "tt",
                            multiEntry: true,
                            includeDataInIndex: true,
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  const p1 = prov
                    .getOnly("test", "ind1", "a")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p1b = prov
                    .getOnly("test", "ind1", "b")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p2 = prov
                    .getOnly("test", undefined, "abc")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p3 = prov
                    .getOnly("test", "ind1", "abc")
                    .then((items) => {
                      assert.equal(items.length, 0);
                    });
                  return Promise.all([p1, p1b, p2, p3])
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Change multientry index from includeDataInIndex", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                    indexes: [
                      {
                        name: "ind1",
                        keyPath: "tt",
                        multiEntry: true,
                        includeDataInIndex: true,
                      },
                    ],
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", tt: ["a", "b"] })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                        indexes: [
                          {
                            name: "ind1",
                            keyPath: "tt",
                            multiEntry: true,
                            includeDataInIndex: false,
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  const p1 = prov
                    .getOnly("test", "ind1", "a")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p1b = prov
                    .getOnly("test", "ind1", "b")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p2 = prov
                    .getOnly("test", undefined, "abc")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  const p3 = prov
                    .getOnly("test", "ind1", "abc")
                    .then((items) => {
                      assert.equal(items.length, 0);
                    });
                  return Promise.all([p1, p1b, p2, p3])
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Adding new FTS store", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                      },
                      {
                        name: "test2",
                        primaryKeyPath: "id",
                        indexes: [
                          {
                            name: "a",
                            keyPath: "content",
                            fullText: true,
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  return prov
                    .put("test2", { id: "def", content: "ghi" })
                    .then(() => {
                      const p1 = prov.get("test", "abc").then((item: any) => {
                        assert.ok(item);
                        assert.equal(item.id, "abc");
                      });
                      const p2 = prov.get("test2", "abc").then((item) => {
                        assert.ok(!item);
                      });
                      const p3 = prov.get("test2", "def").then((item) => {
                        assert.ok(item);
                      });
                      const p4 = prov
                        .fullTextSearch("test2", "a", "ghi")
                        .then((items: any[]) => {
                          assert.equal(items.length, 1);
                          assert.equal(items[0].id, "def");
                        });
                      return Promise.all([p1, p2, p3, p4])
                        .then(() => prov.close())
                        .catch((e) =>
                          prov.close().then(() => Promise.reject(e))
                        );
                    });
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Adding new FTS index", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", content: "ghi" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                        indexes: [
                          {
                            name: "a",
                            keyPath: "content",
                            fullText: true,
                          },
                        ],
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  const p1 = prov.get("test", "abc").then((item: any) => {
                    assert.ok(item);
                    assert.equal(item.id, "abc");
                  });
                  const p2 = prov
                    .fullTextSearch("test", "a", "ghi")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    });
                  return Promise.all([p1, p2])
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          it("Removing FTS index", (done) => {
            openProvider(
              provName,
              {
                version: 1,
                stores: [
                  {
                    name: "test",
                    primaryKeyPath: "id",
                    indexes: [
                      {
                        name: "a",
                        keyPath: "content",
                        fullText: true,
                      },
                    ],
                  },
                ],
              },
              true
            )
              .then((prov) => {
                return prov
                  .put("test", { id: "abc", content: "ghi" })
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              })
              .then(() => {
                return openProvider(
                  provName,
                  {
                    version: 2,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                      },
                    ],
                  },
                  false
                ).then((prov) => {
                  const p1 = prov.get("test", "abc").then((item: any) => {
                    assert.ok(item);
                    assert.equal(item.id, "abc");
                    assert.equal(item.content, "ghi");
                  });
                  const p2 = prov
                    .fullTextSearch("test", "a", "ghi")
                    .then((items: any[]) => {
                      assert.equal(items.length, 1);
                      assert.equal(items[0].id, "abc");
                    })
                    .then(
                      () => {
                        assert.ok(false, "should not work");
                      },
                      () => {
                        return Promise.resolve();
                      }
                    );
                  return Promise.all([p1, p2])
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                });
              })
              .then(
                () => done(),
                (err) => done(err)
              );
          });

          if (provName === "indexeddbonupgradehandler") {
            describe("upgradeCallback", () => {
              it("invokes upgradeHandler for success scenario with upgrade steps", (done) => {
                const upgradeHandler: UpgradeCallback = (upgradeDetails) => {
                  try {
                    assert.equal(upgradeDetails.status, "Success");
                    assert.equal(upgradeDetails.oldVersion, 1);
                    assert.equal(upgradeDetails.newVersion, 2);
                    assert.ok(upgradeDetails.upgradeSteps.length > 0);
                    assert.equal(
                      upgradeDetails.upgradeSteps[1].step,
                      "DBUpgradeComplete"
                    );
                    done();
                  } catch (err) {
                    done(err);
                  }
                };

                openProvider(
                  provName,
                  {
                    version: 1,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                      },
                    ],
                  },
                  true
                )
                  .then((prov) => {
                    return prov
                      .put("test", { id: "abc" })
                      .then(() => prov.close())
                      .catch((e) => prov.close().then(() => Promise.reject(e)));
                  })
                  .then(() => {
                    return openProvider(
                      provName,
                      {
                        version: 2,
                        stores: [
                          {
                            name: "test",
                            primaryKeyPath: "id",
                          },
                          {
                            name: "test2",
                            primaryKeyPath: "ttt",
                          },
                        ],
                      },
                      false,
                      undefined,
                      undefined,
                      upgradeHandler
                    ).then((prov) => {
                      return prov
                        .put("test2", { id: "def", ttt: "ghi" })
                        .then(() => {
                          const p1 = prov.get("test", "abc").then((itemVal) => {
                            const item = itemVal as TestObj;
                            assert(!!item);
                            assert.equal(item.id, "abc");
                          });
                          const p2 = prov.get("test2", "abc").then((item) => {
                            assert(!item);
                          });
                          return Promise.all([p1, p2]);
                        })
                        .then(() => prov.close())
                        .catch((e) =>
                          prov.close().then(() => Promise.reject(e))
                        );
                    });
                  })
                  .then(
                    () => {},
                    (err) => done(err)
                  );
              });

              it("invokes upgradeHandler for failure scenario during migration", (done) => {
                const upgradeHandler: UpgradeCallback = (upgradeDetails) => {
                  assert.equal(upgradeDetails.status, "Error");
                  assert.ok(upgradeDetails.errorMessage);
                  done();
                };

                // Save the original function
                const originalWrapRequest =
                  IndexedDbProviderModule.IndexedDbProvider.WrapRequest;

                // Mock the function to simulate a failure
                IndexedDbProviderModule.IndexedDbProvider.WrapRequest =
                  function (): Promise<any> {
                    console.log("Mocked WrapRequest called");
                    return Promise.reject(
                      new Error("Mocked WrapRequest failure")
                    );
                  };

                // Open the database with version 1
                openProvider(
                  "indexeddbonupgradehandler",
                  {
                    version: 1,
                    stores: [
                      {
                        name: "test",
                        primaryKeyPath: "id",
                      },
                    ],
                  },
                  true,
                  undefined,
                  undefined,
                  upgradeHandler
                )
                  .then((prov) => prov.close())
                  .then(() => {
                    // Reopen the database with version 2 to trigger the mocked migration failure
                    return openProvider(
                      "indexeddbonupgradehandler",
                      {
                        version: 2,
                        stores: [
                          {
                            name: "test",
                            primaryKeyPath: "id",
                            indexes: [
                              {
                                name: "ind1",
                                keyPath: "id",
                                doNotBackfill: false,
                                fullText: true,
                              },
                            ],
                          },
                        ],
                      },
                      false,
                      undefined,
                      undefined,
                      upgradeHandler
                    );
                  })
                  .catch(() => {
                    // Expected failure
                  })
                  .finally(() => {
                    // Restore the original function
                    IndexedDbProviderModule.IndexedDbProvider.WrapRequest =
                      originalWrapRequest;
                  });
              });
            });
          }

          // indexed db might backfill anyway behind the scenes
          if (provName.indexOf("indexeddb") !== 0) {
            it("Adding an index that does not require backfill", (done) => {
              return openProvider(
                provName,
                {
                  version: 1,
                  stores: [
                    {
                      name: "test",
                      primaryKeyPath: "id",
                    },
                  ],
                },
                true
              )
                .then((prov) => {
                  return prov
                    .put("test", { id: "abc", tt: "a" })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                })
                .then(() => {
                  return openProvider(
                    provName,
                    {
                      version: 2,
                      stores: [
                        {
                          name: "test",
                          primaryKeyPath: "id",
                          indexes: [
                            {
                              name: "ind1",
                              keyPath: "tt",
                              doNotBackfill: true,
                            },
                          ],
                        },
                      ],
                    },
                    false
                  ).then((prov) =>
                    prov.put("test", { id: "bcd", tt: "b" }).then(() => {
                      const p1 = prov
                        .getOnly("test", "ind1", "a")
                        .then((items: any[]) => {
                          // item not found, we didn't backfill the first item
                          assert.equal(items.length, 0);
                        });
                      const p2 = prov
                        .getOnly("test", undefined, "abc")
                        .then((items: any[]) => {
                          assert.equal(items.length, 1);
                          assert.equal(items[0].id, "abc");
                          assert.equal(items[0].tt, "a");
                        });
                      const p3 = prov
                        .getOnly("test", "ind1", "b")
                        .then((items: any[]) => {
                          // index works properly for the new item
                          assert.equal(items.length, 1);
                          assert.equal(items[0].id, "bcd");
                          assert.equal(items[0].tt, "b");
                        });
                      return Promise.all([p1, p2, p3])
                        .then(() => prov.close())
                        .catch((e) =>
                          prov.close().then(() => Promise.reject(e))
                        );
                    })
                  );
                })
                .then(
                  () => done(),
                  (err) => done(err)
                );
            });

            it("Adding two indexes at once - backfill and not", (done) => {
              openProvider(
                provName,
                {
                  version: 1,
                  stores: [
                    {
                      name: "test",
                      primaryKeyPath: "id",
                    },
                  ],
                },
                true
              )
                .then((prov) => {
                  return prov
                    .put("test", { id: "abc", tt: "a", zz: "b" })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                })
                .then(() => {
                  return openProvider(
                    provName,
                    {
                      version: 2,
                      stores: [
                        {
                          name: "test",
                          primaryKeyPath: "id",
                          indexes: [
                            {
                              name: "ind1",
                              keyPath: "tt",
                              doNotBackfill: true,
                            },
                            {
                              name: "ind2",
                              keyPath: "zz",
                            },
                          ],
                        },
                      ],
                    },
                    false
                  ).then((prov) => {
                    const p1 = prov
                      .getOnly("test", "ind1", "a")
                      .then((items: any[]) => {
                        // we had to backfill, so we filled all
                        assert.equal(items.length, 1);
                        assert.equal(items[0].id, "abc");
                        assert.equal(items[0].tt, "a");
                        assert.equal(items[0].zz, "b");
                      });
                    const p2 = prov
                      .getOnly("test", undefined, "abc")
                      .then((items: any[]) => {
                        assert.equal(items.length, 1);
                        assert.equal(items[0].id, "abc");
                        assert.equal(items[0].tt, "a");
                        assert.equal(items[0].zz, "b");
                      });
                    const p3 = prov
                      .getOnly("test", "ind2", "b")
                      .then((items: any[]) => {
                        // index works properly for the second index
                        assert.equal(items.length, 1);
                        assert.equal(items[0].id, "abc");
                        assert.equal(items[0].tt, "a");
                        assert.equal(items[0].zz, "b");
                      });
                    return Promise.all([p1, p2, p3])
                      .then(() => prov.close())
                      .catch((e) => prov.close().then(() => Promise.reject(e)));
                  });
                })
                .then(
                  () => done(),
                  (err) => done(err)
                );
            });

            it("Change no backfill index into a normal index", (done) => {
              openProvider(
                provName,
                {
                  version: 1,
                  stores: [
                    {
                      name: "test",
                      primaryKeyPath: "id",
                      indexes: [
                        {
                          name: "ind1",
                          keyPath: "tt",
                          doNotBackfill: true,
                        },
                      ],
                    },
                  ],
                },
                true
              )
                .then((prov) => {
                  return prov
                    .put("test", { id: "abc", tt: "a", zz: "b" })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                })
                .then(() => {
                  return openProvider(
                    provName,
                    {
                      version: 2,
                      stores: [
                        {
                          name: "test",
                          primaryKeyPath: "id",
                          indexes: [
                            {
                              name: "ind1",
                              keyPath: "tt",
                            },
                          ],
                        },
                      ],
                    },
                    false
                  ).then((prov) => {
                    const p1 = prov
                      .getOnly("test", "ind1", "a")
                      .then((items: any[]) => {
                        // we backfilled
                        assert.equal(items.length, 1);
                        assert.equal(items[0].id, "abc");
                        assert.equal(items[0].tt, "a");
                        assert.equal(items[0].zz, "b");
                      });
                    const p2 = prov
                      .getOnly("test", undefined, "abc")
                      .then((items: any[]) => {
                        assert.equal(items.length, 1);
                        assert.equal(items[0].id, "abc");
                        assert.equal(items[0].tt, "a");
                        assert.equal(items[0].zz, "b");
                      });
                    return Promise.all([p1, p2])
                      .then(() => prov.close())
                      .catch((e) => prov.close().then(() => Promise.reject(e)));
                  });
                })
                .then(
                  () => done(),
                  (err) => done(err)
                );
            });

            it("Perform two updates which require no backfill", (done) => {
              openProvider(
                provName,
                {
                  version: 1,
                  stores: [
                    {
                      name: "test",
                      primaryKeyPath: "id",
                    },
                  ],
                },
                true
              )
                .then((prov) => {
                  return prov
                    .put("test", { id: "abc", tt: "a", zz: "aa" })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                })
                .then(() => {
                  return openProvider(
                    provName,
                    {
                      version: 2,
                      stores: [
                        {
                          name: "test",
                          primaryKeyPath: "id",
                          indexes: [
                            {
                              name: "ind1",
                              keyPath: "tt",
                              doNotBackfill: true,
                            },
                          ],
                        },
                      ],
                    },
                    false
                  ).then((prov) => {
                    return prov
                      .put("test", { id: "bcd", tt: "b", zz: "bb" })
                      .then(() => prov.close())
                      .catch((e) => prov.close().then(() => Promise.reject(e)));
                  });
                })
                .then(() => {
                  return openProvider(
                    provName,
                    {
                      version: 3,
                      stores: [
                        {
                          name: "test",
                          primaryKeyPath: "id",
                          indexes: [
                            {
                              name: "ind1",
                              keyPath: "tt",
                              doNotBackfill: true,
                            },
                            {
                              name: "ind2",
                              keyPath: "zz",
                              doNotBackfill: true,
                            },
                          ],
                        },
                      ],
                    },
                    false
                  ).then((prov) => {
                    const p1 = prov
                      .getOnly("test", "ind1", "a")
                      .then((items: any[]) => {
                        // item not found, we didn't backfill the first item
                        assert.equal(items.length, 0);
                      });
                    const p2 = prov
                      .getOnly("test", undefined, "abc")
                      .then((items: any[]) => {
                        assert.equal(items.length, 1);
                        assert.equal(items[0].id, "abc");
                        assert.equal(items[0].tt, "a");
                        assert.equal(items[0].zz, "aa");
                      });
                    const p3 = prov
                      .getOnly("test", "ind1", "b")
                      .then((items: any[]) => {
                        // first index works properly for the second item
                        assert.equal(items.length, 1);
                        assert.equal(items[0].id, "bcd");
                        assert.equal(items[0].tt, "b");
                      });
                    const p4 = prov
                      .getOnly("test", "ind2", "bb")
                      .then((items: any[]) => {
                        // second index wasn't backfilled
                        assert.equal(items.length, 0);
                      });
                    return Promise.all([p1, p2, p3, p4])
                      .then(() => prov.close())
                      .catch((e) => prov.close().then(() => Promise.reject(e)));
                  });
                })
                .then(
                  () => done(),
                  (err) => done(err)
                );
            });

            it("Removes index without pulling data to JS", (done) => {
              openProvider(
                provName,
                {
                  version: 1,
                  stores: [
                    {
                      name: "test",
                      primaryKeyPath: "id",
                      indexes: [
                        {
                          name: "ind1",
                          keyPath: "content",
                        },
                      ],
                    },
                  ],
                },
                true
              )
                .then((prov) => {
                  return prov
                    .put("test", { id: "abc", content: "ghi" })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                })
                .then(() => {
                  return openProvider(
                    provName,
                    {
                      version: 2,
                      stores: [
                        {
                          name: "test",
                          primaryKeyPath: "id",
                        },
                      ],
                    },
                    false
                  ).then((prov) => {
                    // check the index was actually removed
                    const p1 = prov.get("test", "abc").then((item: any) => {
                      assert.ok(item);
                      assert.equal(item.id, "abc");
                      assert.equal(item.content, "ghi");
                    });
                    const p2 = prov
                      .getOnly("test", "ind1", "ghi")
                      .then((items: any[]) => {
                        assert.equal(items.length, 1);
                        assert.equal(items[0].id, "abc");
                      })
                      .then(
                        () => {
                          assert.ok(false, "should not work");
                        },
                        () => {
                          return Promise.resolve();
                        }
                      );
                    return Promise.all([p1, p2])
                      .then(() => prov.close())
                      .catch((e) => prov.close().then(() => Promise.reject(e)));
                  });
                })
                .then(
                  () => done(),
                  (err) => done(err)
                );
            });

            it("Add and remove index in the same upgrade", (done) => {
              openProvider(
                provName,
                {
                  version: 1,
                  stores: [
                    {
                      name: "test",
                      primaryKeyPath: "id",
                      indexes: [
                        {
                          name: "ind1",
                          keyPath: "tt",
                          doNotBackfill: true,
                        },
                      ],
                    },
                  ],
                },
                true
              )
                .then((prov) => {
                  return prov
                    .put("test", { id: "abc", tt: "a", zz: "aa" })
                    .then(() => prov.close())
                    .catch((e) => prov.close().then(() => Promise.reject(e)));
                })
                .then(() => {
                  return openProvider(
                    provName,
                    {
                      version: 2,
                      stores: [
                        {
                          name: "test",
                          primaryKeyPath: "id",
                          indexes: [
                            {
                              name: "ind2",
                              keyPath: "zz",
                              doNotBackfill: true,
                            },
                          ],
                        },
                      ],
                    },
                    false
                  ).then((prov) => {
                    const p1 = prov
                      .getOnly("test", undefined, "abc")
                      .then((items: any[]) => {
                        assert.equal(items.length, 1);
                        assert.equal(items[0].id, "abc");
                        assert.equal(items[0].tt, "a");
                        assert.equal(items[0].zz, "aa");
                      });
                    const p2 = prov.getOnly("test", "ind1", "a").then(
                      () => {
                        return Promise.reject<void>("Shouldn't have worked");
                      },
                      () => {
                        // Expected to fail, so chain from failure to success
                        return undefined;
                      }
                    );

                    return Promise.all([p1, p2])
                      .then(() => prov.close())
                      .catch((e) => prov.close().then(() => Promise.reject(e)));
                  });
                })
                .then(
                  () => done(),
                  (err) => done(err)
                );
            });
          }
        });
      }

      it("Full Text Index - Happy path", (done) => {
        openProvider(
          provName,
          {
            version: 2,
            stores: [
              {
                name: "test",
                primaryKeyPath: "id",
                indexes: [
                  {
                    name: "i",
                    keyPath: "txt",
                    fullText: true,
                    unique: false,
                  },
                ],
              },
            ],
          },
          true
        )
          .then((prov) => {
            return prov
              .put("test", [
                {
                  id: "a1",
                  txt: "the quick brown fox jumps over the lăzy dog who is a bro with brows",
                },
                { id: "a2", txt: "bob likes his dog" },
                { id: "a8", txt: "mark marley" },
                { id: "a3", txt: "tes>ter" },
                {
                  id: "a4",
                  txt:
                    "Бывает проснешься как птица," +
                    " крылатой пружиной на взводе и хочется жить и трудиться, но к завтраку это проходит!",
                },
                {
                  id: "a5",
                  txt: "漁夫從遠處看見漁夫",
                },
                {
                  // i18n digits test case
                  id: "a6",
                  txt: "߂i18nDigits߂",
                },
                {
                  // Test data to make sure that we don't search for empty strings (... used to put empty string to the index)
                  id: "a7",
                  txt: "User1, User2, User3 ...",
                },
                { id: "a9", txt: "mark dunnford" },
                { id: "a10", txt: "alice cooper" },
              ])
              .then(() => {
                const p1 = prov
                  .fullTextSearch("test", "i", "brown")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p2 = prov
                  .fullTextSearch("test", "i", "dog")
                  .then((res) => {
                    assert.equal(res.length, 2);
                  });
                const p3 = prov
                  .fullTextSearch("test", "i", "do")
                  .then((res) => {
                    assert.equal(res.length, 2);
                  });
                const p4 = prov
                  .fullTextSearch("test", "i", "LiKe")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a2");
                  });
                const p5 = prov
                  .fullTextSearch("test", "i", "azy")
                  .then((res) => {
                    assert.equal(res.length, 0);
                  });
                const p6 = prov
                  .fullTextSearch("test", "i", "lazy dog")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p7 = prov
                  .fullTextSearch("test", "i", "dog lazy")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p8 = prov
                  .fullTextSearch("test", "i", "DOG lăzy")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p9 = prov
                  .fullTextSearch("test", "i", "lĄzy")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p10 = prov
                  .fullTextSearch("test", "i", "brown brown brown")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p11 = prov
                  .fullTextSearch("test", "i", "brown brOwn browN")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p12 = prov
                  .fullTextSearch("test", "i", "brow")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p13 = prov
                  .fullTextSearch("test", "i", "bro")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p14 = prov
                  .fullTextSearch("test", "i", "br")
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p15 = prov
                  .fullTextSearch("test", "i", "b")
                  .then((res) => {
                    assert.equal(res.length, 2);
                  });
                const p16 = prov
                  .fullTextSearch("test", "i", "b z")
                  .then((res) => {
                    assert.equal(res.length, 0);
                  });
                const p17 = prov
                  .fullTextSearch("test", "i", "b z", FullTextTermResolution.Or)
                  .then((res: any[]) => {
                    assert.equal(res.length, 2);
                    assert.ok(
                      some(res, (r) => r.id === "a1") &&
                        some(res, (r) => r.id === "a2")
                    );
                  });
                const p18 = prov
                  .fullTextSearch("test", "i", "q h", FullTextTermResolution.Or)
                  .then((res: any[]) => {
                    assert.equal(res.length, 2);
                    assert.ok(
                      some(res, (r) => r.id === "a1") &&
                        some(res, (r) => r.id === "a2")
                    );
                  });
                const p19 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "fox nopers",
                    FullTextTermResolution.Or
                  )
                  .then((res: any[]) => {
                    assert.equal(res.length, 1);
                    assert.equal(res[0].id, "a1");
                  });
                const p20 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "foxers nopers",
                    FullTextTermResolution.Or
                  )
                  .then((res) => {
                    assert.equal(res.length, 0);
                  });
                const p21 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "fox)",
                    FullTextTermResolution.Or
                  )
                  .then((res) => {
                    assert.equal(res.length, 1);
                  });
                const p22 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "fox*",
                    FullTextTermResolution.Or
                  )
                  .then((res) => {
                    assert.equal(res.length, 1);
                  });
                const p23 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "fox* fox( <fox>",
                    FullTextTermResolution.Or
                  )
                  .then((res) => {
                    assert.equal(res.length, 1);
                  });
                const p24 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "f)ox",
                    FullTextTermResolution.Or
                  )
                  .then((res) => {
                    assert.equal(res.length, 0);
                  });
                const p25 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "fo*x",
                    FullTextTermResolution.Or
                  )
                  .then((res) => {
                    assert.equal(res.length, 0);
                  });
                const p26 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "tes>ter",
                    FullTextTermResolution.Or
                  )
                  .then((res) => {
                    assert.equal(res.length, 1);
                  });
                const p27 = prov
                  .fullTextSearch("test", "i", "f*x", FullTextTermResolution.Or)
                  .then((res) => {
                    assert.equal(res.length, 0);
                  });

                const p28 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "бывает",
                    FullTextTermResolution.Or
                  )
                  .then((res) => {
                    assert.equal(res.length, 1);
                  });

                const p29 = prov
                  .fullTextSearch("test", "i", "漁", FullTextTermResolution.Or)
                  .then((res) => {
                    assert.equal(res.length, 1);
                  });

                const p30 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "߂i18nDigits߂",
                    FullTextTermResolution.Or
                  )
                  .then((res) => {
                    assert.equal(res.length, 1);
                  });

                // This is an empty string test. All special symbols will be replaced so this is technically empty string search.
                const p31 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "!@#$%$",
                    FullTextTermResolution.Or
                  )
                  .then((res) => {
                    assert.equal(res.length, 0);
                  });
                const p32 = prov
                  .fullTextSearch("test", "i", "mark")
                  .then((res: any[]) => {
                    assert.equal(res.length, 2);
                    assert.ok(
                      some(res, (r) => r.id === "a8") &&
                        some(res, (r) => r.id === "a9")
                    );
                  });
                const p33 = prov
                  .fullTextSearch(
                    "test",
                    "i",
                    "mark",
                    FullTextTermResolution.Or,
                    10
                  )
                  .then((res: any[]) => {
                    assert.equal(res.length, 2);
                    assert.ok(
                      some(res, (r) => r.id === "a8") &&
                        some(res, (r) => r.id === "a9")
                    );
                  });

                return Promise.all([
                  p1,
                  p2,
                  p3,
                  p4,
                  p5,
                  p6,
                  p7,
                  p8,
                  p9,
                  p10,
                  p11,
                  p12,
                  p13,
                  p14,
                  p15,
                  p16,
                  p17,
                  p18,
                  p19,
                  p20,
                  p21,
                  p22,
                  p23,
                  p24,
                  p25,
                  p26,
                  p27,
                  p28,
                  p29,
                  p30,
                  p31,
                  p32,
                  p33,
                ])
                  .then(() => prov.close())
                  .catch((e) => prov.close().then(() => Promise.reject(e)));
              });
          })
          .then(
            () => done(),
            (err) => done(err)
          );
      });

      it("Full Text Index - Returns only the limit passed for OR resolution", async () => {
        return openProvider(
          provName,
          {
            version: 2,
            stores: [
              {
                name: "test",
                primaryKeyPath: "id",
                indexes: [
                  {
                    name: "i",
                    keyPath: "txt",
                    fullText: true,
                    unique: false,
                  },
                ],
              },
            ],
          },
          true
        ).then((prov) => {
          const itemsToPut = [];
          for (var i = 0; i < 100; i++) {
            itemsToPut.push({ id: `a${i}`, txt: `aaaaaa${i}` });
          }

          prov.put("test", itemsToPut).then(() => {
            prov
              .fullTextSearch("test", "i", "a", FullTextTermResolution.Or, 10)
              .then((results) => {
                assert.equal(results.length, 10);
                prov.close();
              });
          });
        });
      });

      it("Full Text Index - Returns only the limit passed for AND resolution", async () => {
        return openProvider(
          provName,
          {
            version: 2,
            stores: [
              {
                name: "test",
                primaryKeyPath: "id",
                indexes: [
                  {
                    name: "i",
                    keyPath: "txt",
                    fullText: true,
                    unique: false,
                  },
                ],
              },
            ],
          },
          true
        ).then((prov) => {
          const itemsToPut = [];
          for (var i = 0; i < 100; i++) {
            itemsToPut.push({ id: `a${i}`, txt: `aaaaaa${i}` });
          }

          prov.put("test", itemsToPut).then(() => {
            prov
              .fullTextSearch("test", "i", "a", FullTextTermResolution.And, 10)
              .then((results) => {
                assert.equal(results.length, 10);
                prov.close();
              });
          });
        });
      });

      if (provName === "memory-rbtree" || provName === "memory-btree") {
        it("Doesn't create committedStoreData for read-only operation", async () => {
          return openProvider(
            provName,
            {
              version: 2,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                  indexes: [
                    {
                      name: "i",
                      keyPath: "txt",
                      fullText: true,
                      unique: false,
                    },
                  ],
                },
              ],
            },
            true
          ).then((prov) => {
            const itemsToPut = [];
            for (var i = 0; i < 10; i++) {
              itemsToPut.push({ id: `a${i}`, txt: `aaaaaa${i}` });
            }
            assert.equal((<InMemoryProvider>prov)["_supportsRollback"], false);
            prov.put("test", itemsToPut).then(() => {
              prov.openTransaction(["test"], false).then((transaction) => {
                const store = <any>transaction.getStore("test"); // InMemoryStore
                assert.equal(store["_supportsRollback"], false);
                assert.equal(store["_committedStoreData"], undefined);
                prov.close();
              });
            });
          });
        });
        it("InMemoryProvider with supportsRollback = true", async () => {
          return openProvider(
            provName,
            {
              version: 2,
              stores: [
                {
                  name: "test",
                  primaryKeyPath: "id",
                },
              ],
            },
            true,
            undefined,
            true
          ).then((prov) => {
            const itemsToPut = [];
            for (var i = 0; i < 10; i++) {
              itemsToPut.push({ id: `a${i}`, txt: `aaaaaa${i}` });
            }
            assert.equal((<InMemoryProvider>prov)["_supportsRollback"], true);
            prov.put("test", itemsToPut).then(() => {
              prov.openTransaction(["test"], true).then((transaction) => {
                const store = <any>transaction.getStore("test"); // InMemoryStore
                assert.equal(store["_supportsRollback"], true);
                assert.equal(
                  Array.from(store["_committedStoreData"]?.values() || [])
                    .length,
                  10
                );
                prov.close();
              });
            });
          });
        });
      }
    });
  });
});
