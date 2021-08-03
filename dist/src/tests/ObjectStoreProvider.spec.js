"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
var chai_1 = require("chai"); // Mocha doesn't work with import * as syntax, hence this hack.
var lodash_1 = require("lodash");
var ObjectStoreProvider_1 = require("../ObjectStoreProvider");
var InMemoryProvider_1 = require("../InMemoryProvider");
var IndexedDbProvider_1 = require("../IndexedDbProvider");
var ObjectStoreProviderUtils_1 = require("../ObjectStoreProviderUtils");
function openProvider(providerName, schema, wipeFirst, handleOnClose) {
    var provider;
    if (providerName === "memory") {
        provider = new InMemoryProvider_1.InMemoryProvider();
    }
    else if (providerName === "indexeddb") {
        provider = new IndexedDbProvider_1.IndexedDbProvider();
    }
    else if (providerName === "indexeddbfakekeys") {
        provider = new IndexedDbProvider_1.IndexedDbProvider(undefined, false);
    }
    else if (providerName === "indexeddbonclose") {
        provider = new IndexedDbProvider_1.IndexedDbProvider(undefined, undefined, handleOnClose);
    }
    else {
        throw new Error("Provider not found for name: " + providerName);
    }
    var dbName = "test";
    return ObjectStoreProvider_1.openListOfProviders([provider], dbName, schema, wipeFirst, false);
}
function sleep(timeMs) {
    return new Promise(function (resolve) {
        setTimeout(function () {
            resolve(void 0);
        }, timeMs);
    });
}
describe("ObjectStoreProvider", function () {
    this.timeout(5 * 60 * 1000);
    var provsToTest;
    provsToTest = ["memory"];
    provsToTest.push("indexeddb", "indexeddbfakekeys", "indexeddbonclose");
    it("Number/value/type sorting", function () {
        var pairsToTest = [
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
        pairsToTest.forEach(function (pair) {
            chai_1.assert(ObjectStoreProviderUtils_1.serializeValueToOrderableString(pair[0]) <
                ObjectStoreProviderUtils_1.serializeValueToOrderableString(pair[1]), "failed for pair: " + pair);
        });
        try {
            ObjectStoreProviderUtils_1.serializeValueToOrderableString([4, 5]);
            chai_1.assert(false, "Should reject this key");
        }
        catch (e) {
            // Should throw -- expecting this result.
        }
    });
    provsToTest.forEach(function (provName) {
        describe("Provider: " + provName, function () {
            describe("Delete database", function () {
                if (provName.indexOf("memory") !== -1) {
                    xit("Skip delete test for in memory DB", function () {
                        //noop
                    });
                }
                else if (provName.indexOf("indexeddb") === 0) {
                    it("Deletes the database", function (done) {
                        var schema = {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        };
                        openProvider(provName, schema, true)
                            .then(function (prov) {
                            // insert some stuff
                            return (prov
                                .put("test", { id: "a", val: "b" })
                                //then delete
                                .then(function () { return prov.deleteDatabase(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); }));
                        })
                            .then(function () { return openProvider(provName, schema, false); })
                            .then(function (prov) {
                            return prov
                                .get("test", "a")
                                .then(function (retVal) {
                                var ret = retVal;
                                // not found
                                chai_1.assert(!ret);
                            })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                }
                else {
                    it("Rejects with an error", function (done) {
                        var schema = {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        };
                        return openProvider(provName, schema, true)
                            .then(function (prov) {
                            // insert some stuff
                            return prov
                                .put("test", { id: "a", val: "b" })
                                .then(function () { return prov.deleteDatabase(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            //this should not happen
                            chai_1.assert(false, "Should fail");
                        })
                            .catch(function () {
                            // as expected, didn't delete anything
                            return openProvider(provName, schema, false).then(function (prov) {
                                return prov
                                    .get("test", "a")
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.val, "b");
                                })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                }
            });
            describe("Expected database closure", function () {
                if (provName.indexOf("indexeddbonclose") === -1) {
                    xit("Skip expected DB closure for in-memory provider", function () {
                        // noop
                    });
                }
                else {
                    it("logs an expected close event", function (done) {
                        // arrange - create schema
                        var schema = {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        };
                        var checkOnce = false;
                        // arrange - spy function
                        var handleOnClose = function (payload) {
                            if (checkOnce) {
                                return;
                            }
                            checkOnce = true;
                            chai_1.assert.equal(payload.name, "test", "expectedHandleOnClose: actual: " + payload.name + " ");
                            chai_1.assert.equal(payload.objectStores, "test", "expectedHandleOnClose: actual: " + payload.objectStores + " ");
                            chai_1.assert.equal(payload.type, "expectedClosure", "expectedHandleOnClose: type: actual: " + payload.type);
                        };
                        openProvider(provName, schema, true, handleOnClose)
                            .then(function (prov) { return prov.close(); })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                }
            });
            describe("Unexpected database closure", function () {
                if (provName.indexOf("indexeddbonclose") === -1) {
                    xit("Skip unexpected DB closure for in-memory provider", function () {
                        // noop
                    });
                }
                else {
                    it("fires the onClose event handler", function (done) {
                        // arrange - create schema
                        var schema = {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        };
                        var checkOnce = false;
                        // arrange - spy function
                        var handleOnClose = function (payload) {
                            if (checkOnce) {
                                return;
                            }
                            checkOnce = true;
                            chai_1.assert.equal(payload.name, "test", "unexpectedHandleOnClose: actual: " + payload.name + " ");
                            chai_1.assert.equal(payload.objectStores, "test", "unexpectedHandleOnClose: actual: " + payload.objectStores + " ");
                            chai_1.assert.equal(payload.type, "unexpectedClosure", "unexpectedHandleOnClose: type: actual: " + payload.type);
                        };
                        openProvider(provName, schema, true, handleOnClose)
                            .then(function (prov) {
                            var db = prov["_db"];
                            if (db && db.onclose) {
                                db.onclose(new Event("unexpectedClosure"));
                            }
                            return sleep(5).then(function () { return prov; }); // wait for an event tick for the DOM event to be processed
                        })
                            .then(function (prov) { return prov.close(); })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                }
            });
            describe("Data Manipulation", function () {
                // Setter should set the testable parameter on the first param to the value in the second param, and third param to the
                // second index column for compound indexes.
                var tester = function (prov, indexName, compound, setter) {
                    var putters = [1, 2, 3, 4, 5].map(function (v) {
                        var obj = { val: "val" + v };
                        if (indexName) {
                            obj.id = "id" + v;
                        }
                        setter(obj, "indexa" + v, "indexb" + v);
                        return prov.put("test", obj);
                    });
                    return Promise.all(putters).then(function () {
                        var formIndex = function (i, i2) {
                            if (i2 === void 0) { i2 = i; }
                            if (compound) {
                                return ["indexa" + i, "indexb" + i2];
                            }
                            else {
                                return "indexa" + i;
                            }
                        };
                        var t0 = prov
                            .getMultiple("test", compound ? formIndex(1, 1) : "indexa1", indexName)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getMultiple");
                            [1].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }), "cant find " + v);
                            });
                        });
                        var t1 = prov.getAll("test", indexName).then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 5, "getAll");
                            [1, 2, 3, 4, 5].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }), "cant find " + v);
                            });
                        });
                        var t1count = prov.countAll("test", indexName).then(function (ret) {
                            chai_1.assert.equal(ret, 5, "countAll");
                        });
                        var t1b = prov
                            .getAll("test", indexName, false, 3)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 3, "getAll lim3");
                            [1, 2, 3].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }), "cant find " + v);
                            });
                        });
                        var t1c = prov
                            .getAll("test", indexName, false, 3, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 3, "getAll lim3 off1");
                            [2, 3, 4].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }), "cant find " + v);
                            });
                        });
                        var t2 = prov
                            .getOnly("test", indexName, formIndex(3))
                            .then(function (ret) {
                            chai_1.assert.equal(ret.length, 1, "getOnly");
                            chai_1.assert.equal(ret[0].val, "val3");
                        });
                        var t2count = prov
                            .countOnly("test", indexName, formIndex(3))
                            .then(function (ret) {
                            chai_1.assert.equal(ret, 1, "countOnly");
                        });
                        var t3 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4))
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 3, "getRange++");
                            [2, 3, 4].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3count = prov
                            .countRange("test", indexName, formIndex(2), formIndex(4))
                            .then(function (ret) {
                            chai_1.assert.equal(ret, 3, "countRange++");
                        });
                        var t3b = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, false, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange++ lim1");
                            [2].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3b2 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, false, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange++ lim1");
                            [2].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3b3 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, ObjectStoreProvider_1.QuerySortOrder.Forward, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange++ lim1");
                            [2].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3b4 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, ObjectStoreProvider_1.QuerySortOrder.Reverse, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange++ lim1 rev");
                            [4].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3c = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, false, 1, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange++ lim1 off1");
                            [3].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3d = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, false, 2, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 2, "getRange++ lim2 off1");
                            [3, 4].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3d2 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, ObjectStoreProvider_1.QuerySortOrder.Forward, 2, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 2, "getRange++ lim2 off1");
                            [3, 4].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3d3 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, true, 2, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 2, "getRange++ lim2 off1 rev");
                            chai_1.assert.equal(ret[0].val, "val3");
                            [2, 3].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3d4 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, ObjectStoreProvider_1.QuerySortOrder.Reverse, 2, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 2, "getRange++ lim2 off1 rev");
                            chai_1.assert.equal(ret[0].val, "val3");
                            [2, 3].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t4 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), true, false)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 2, "getRange-+");
                            [3, 4].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t4count = prov
                            .countRange("test", indexName, formIndex(2), formIndex(4), true, false)
                            .then(function (ret) {
                            chai_1.assert.equal(ret, 2, "countRange-+");
                        });
                        var t5 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, true)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 2, "getRange+-");
                            [2, 3].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t5count = prov
                            .countRange("test", indexName, formIndex(2), formIndex(4), false, true)
                            .then(function (ret) {
                            chai_1.assert.equal(ret, 2, "countRange+-");
                        });
                        var t6 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), true, true)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange--");
                            [3].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t6count = prov
                            .countRange("test", indexName, formIndex(2), formIndex(4), true, true)
                            .then(function (ret) {
                            chai_1.assert.equal(ret, 1, "countRange--");
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
                        ]).then(function () {
                            if (compound) {
                                var tt1 = prov
                                    .getRange("test", indexName, formIndex(2, 2), formIndex(4, 3))
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 2, "getRange2++");
                                    [2, 3].forEach(function (v) {
                                        chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                                    });
                                });
                                var tt1count = prov
                                    .countRange("test", indexName, formIndex(2, 2), formIndex(4, 3))
                                    .then(function (ret) {
                                    chai_1.assert.equal(ret, 2, "countRange2++");
                                });
                                var tt2 = prov
                                    .getRange("test", indexName, formIndex(2, 2), formIndex(4, 3), false, true)
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 2, "getRange2+-");
                                    [2, 3].forEach(function (v) {
                                        chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                                    });
                                });
                                var tt2count = prov
                                    .countRange("test", indexName, formIndex(2, 2), formIndex(4, 3), false, true)
                                    .then(function (ret) {
                                    chai_1.assert.equal(ret, 2, "countRange2+-");
                                });
                                var tt3 = prov
                                    .getRange("test", indexName, formIndex(2, 2), formIndex(4, 3), true, false)
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 1, "getRange2-+");
                                    [3].forEach(function (v) {
                                        chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                                    });
                                });
                                var tt3count = prov
                                    .countRange("test", indexName, formIndex(2, 2), formIndex(4, 3), true, false)
                                    .then(function (ret) {
                                    chai_1.assert.equal(ret, 1, "countRange2-+");
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
                var nonUniqueTester = function (prov, indexName, compound, setter) {
                    var putters = [1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5].map(function (v, idx) {
                        var obj = { val: "val" + v };
                        if (indexName) {
                            obj.id = "id" + (idx + 1);
                        }
                        setter(obj, "indexa" + v, "indexb" + v);
                        return prov.put("test", obj);
                    });
                    return Promise.all(putters).then(function () {
                        var formIndex = function (i, i2) {
                            if (i2 === void 0) { i2 = i; }
                            if (compound) {
                                return ["indexa" + i, "indexb" + i2];
                            }
                            else {
                                return "indexa" + i;
                            }
                        };
                        var t0 = prov
                            .getMultiple("test", compound ? formIndex(1, 1) : "indexa1", indexName)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 3, "getMultiple");
                            [1].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }), "cant find " + v);
                            });
                        });
                        var t1 = prov.getAll("test", indexName).then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 12, "getAll");
                            [1, 2, 3, 4, 5].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }), "cant find " + v);
                            });
                        });
                        var t1count = prov.countAll("test", indexName).then(function (ret) {
                            chai_1.assert.equal(ret, 12, "countAll");
                        });
                        var t1b = prov
                            .getAll("test", indexName, false, 3)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 3, "getAll lim3");
                            [1].forEach(function (v) {
                                chai_1.assert(lodash_1.filter(ret, function (r) { return r.val === "val" + v; }).length === 3, "cant find enough " + v);
                            });
                        });
                        var t1c = prov
                            .getAll("test", indexName, false, 3, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 3, "getAll lim3 off1");
                            [2, 3, 4].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.id === "id" + v; }), "cant find id " + v);
                            });
                        });
                        var t2 = prov
                            .getOnly("test", indexName, formIndex(3))
                            .then(function (ret) {
                            chai_1.assert.equal(ret.length, 3, "getOnly");
                            chai_1.assert.equal(ret[0].val, "val3");
                            chai_1.assert.equal(ret[1].val, "val3");
                            chai_1.assert.equal(ret[2].val, "val3");
                        });
                        var t2count = prov
                            .countOnly("test", indexName, formIndex(3))
                            .then(function (ret) {
                            chai_1.assert.equal(ret, 3, "countOnly");
                        });
                        var t3 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4))
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 7, "getRange++");
                            [4, 5, 6, 7, 8, 9, 10].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.id === "id" + v; }));
                            });
                        });
                        var t3count = prov
                            .countRange("test", indexName, formIndex(2), formIndex(4))
                            .then(function (ret) {
                            chai_1.assert.equal(ret, 7, "countRange++");
                        });
                        var t3b = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, false, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange++ lim1");
                            [2].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3b2 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, false, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange++ lim1");
                            [2].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3b3 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, ObjectStoreProvider_1.QuerySortOrder.Forward, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange++ lim1");
                            [2].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3b4 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, ObjectStoreProvider_1.QuerySortOrder.Reverse, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange++ lim1 rev");
                            [4].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3c = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, false, 1, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 1, "getRange++ lim1 off1");
                            [5].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.id === "id" + v; }));
                            });
                        });
                        var t3d = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, false, 2, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 2, "getRange++ lim2 off1");
                            [5, 6].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.id === "id" + v; }));
                            });
                        });
                        var t3d2 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, ObjectStoreProvider_1.QuerySortOrder.Forward, 2, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 2, "getRange++ lim2 off1");
                            [5, 6].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.id === "id" + v; }));
                            });
                        });
                        var t3d3 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, true, 2, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 2, "getRange++ lim2 off1 rev");
                            chai_1.assert.equal(ret[0].val, "val4");
                            [3, 4].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t3d4 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, false, ObjectStoreProvider_1.QuerySortOrder.Reverse, 2, 1)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 2, "getRange++ lim2 off1 rev");
                            chai_1.assert.equal(ret[0].val, "val4");
                            [3, 4].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                            });
                        });
                        var t4 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), true, false)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 5, "getRange-+");
                            [6, 7, 8, 9, 10].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.id === "id" + v; }));
                            });
                        });
                        var t4count = prov
                            .countRange("test", indexName, formIndex(2), formIndex(4), true, false)
                            .then(function (ret) {
                            chai_1.assert.equal(ret, 5, "countRange-+");
                        });
                        var t5 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), false, true)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 5, "getRange+-");
                            [4, 5, 6, 7, 8].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.id === "id" + v; }));
                            });
                        });
                        var t5count = prov
                            .countRange("test", indexName, formIndex(2), formIndex(4), false, true)
                            .then(function (ret) {
                            chai_1.assert.equal(ret, 5, "countRange+-");
                        });
                        var t6 = prov
                            .getRange("test", indexName, formIndex(2), formIndex(4), true, true)
                            .then(function (retVal) {
                            var ret = retVal;
                            chai_1.assert.equal(ret.length, 3, "getRange--");
                            [6, 7, 8].forEach(function (v) {
                                chai_1.assert(lodash_1.find(ret, function (r) { return r.id === "id" + v; }));
                            });
                        });
                        var t6count = prov
                            .countRange("test", indexName, formIndex(2), formIndex(4), true, true)
                            .then(function (ret) {
                            chai_1.assert.equal(ret, 3, "countRange--");
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
                        ]).then(function () {
                            if (compound) {
                                var tt1 = prov
                                    .getRange("test", indexName, formIndex(2, 2), formIndex(4, 3))
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 2, "getRange2++");
                                    [2, 3].forEach(function (v) {
                                        chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                                    });
                                });
                                var tt1count = prov
                                    .countRange("test", indexName, formIndex(2, 2), formIndex(4, 3))
                                    .then(function (ret) {
                                    chai_1.assert.equal(ret, 2, "countRange2++");
                                });
                                var tt2 = prov
                                    .getRange("test", indexName, formIndex(2, 2), formIndex(4, 3), false, true)
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 2, "getRange2+-");
                                    [2, 3].forEach(function (v) {
                                        chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                                    });
                                });
                                var tt2count = prov
                                    .countRange("test", indexName, formIndex(2, 2), formIndex(4, 3), false, true)
                                    .then(function (ret) {
                                    chai_1.assert.equal(ret, 2, "countRange2+-");
                                });
                                var tt3 = prov
                                    .getRange("test", indexName, formIndex(2, 2), formIndex(4, 3), true, false)
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 1, "getRange2-+");
                                    [3].forEach(function (v) {
                                        chai_1.assert(lodash_1.find(ret, function (r) { return r.val === "val" + v; }));
                                    });
                                });
                                var tt3count = prov
                                    .countRange("test", indexName, formIndex(2, 2), formIndex(4, 3), true, false)
                                    .then(function (ret) {
                                    chai_1.assert.equal(ret, 1, "countRange2-+");
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
                            else {
                                return Promise.resolve(void 0);
                            }
                        });
                    });
                };
                it("Simple primary key put/get/getAll", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", { id: "a", val: "b" })
                            .then(function () {
                            return prov.get("test", "a").then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.val, "b");
                                return prov.getAll("test", undefined).then(function (ret2Val) {
                                    var ret2 = ret2Val;
                                    chai_1.assert.equal(ret2.length, 1);
                                    chai_1.assert.equal(ret2[0].val, "b");
                                });
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Putting the same primary key should overwrite", function (done) {
                    var objToPut = { id: "a", val: "b" };
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", objToPut)
                            .then(function () { return (objToPut.val = "c"); })
                            .then(function () { return prov.put("test", objToPut); })
                            .then(function () { return prov.get("test", "a"); })
                            .then(function (retVal) { return chai_1.assert.equal(retVal.val, "c"); })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); })
                            .then(function () { return done(); });
                    })
                        .catch(function (e) { return done(e); });
                });
                it("Putting the same secondary non-unique key should overwrite", function (done) {
                    var objToPut = { id: "a", val: "b" };
                    openProvider(provName, {
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
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", objToPut)
                            // add another item with the same index value
                            .then(function () { return (objToPut = { id: "c", val: "b" }); })
                            .then(function () { return prov.put("test", objToPut); })
                            .then(function () { return prov.get("test", "a"); })
                            .then(function (retVal) { return chai_1.assert.equal(retVal.val, "b"); })
                            .then(function () { return prov.getOnly("test", "index", "b"); })
                            // non-unique index should have two items: a and c primary keys
                            .then(function (retVal) { return chai_1.assert.equal(retVal.length, 2); })
                            // add another item with the same pk as the first one,
                            // it should overwrite the "a" item, but also keep the "c" item in the index
                            .then(function () { return (objToPut = { id: "a", val: "b" }); })
                            .then(function () { return prov.put("test", objToPut); })
                            .then(function () { return prov.getOnly("test", "index", "b"); })
                            // non-unique index should still have two items
                            .then(function (retVal) { return chai_1.assert.equal(retVal.length, 2); })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); })
                            .then(function () { return done(); });
                    })
                        .catch(function (e) { return done(e); });
                });
                it("Empty gets/puts", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", [])
                            .then(function () {
                            return prov.getAll("test", undefined).then(function (rets) {
                                chai_1.assert(!!rets);
                                chai_1.assert.equal(rets.length, 0);
                                return prov.getMultiple("test", []).then(function (rets) {
                                    chai_1.assert(!!rets);
                                    chai_1.assert.equal(rets.length, 0);
                                });
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("getMultiple with blank", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", [1, 3].map(function (i) {
                            return { id: "a" + i };
                        }))
                            .then(function () {
                            return prov
                                .getMultiple("test", ["a1", "a2", "a3"])
                                .then(function (rets) {
                                chai_1.assert(!!rets);
                                chai_1.assert.equal(rets.length, 2);
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Removing items", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", [1, 2, 3, 4, 5].map(function (i) {
                            return { id: "a" + i };
                        }))
                            .then(function () {
                            return prov.getAll("test", undefined).then(function (rets) {
                                chai_1.assert(!!rets);
                                chai_1.assert.equal(rets.length, 5);
                                return prov.remove("test", "a1").then(function () {
                                    return prov.getAll("test", undefined).then(function (rets) {
                                        chai_1.assert(!!rets);
                                        chai_1.assert.equal(rets.length, 4);
                                        return prov
                                            .remove("test", ["a3", "a4", "a2"])
                                            .then(function () {
                                            return prov
                                                .getAll("test", undefined)
                                                .then(function (retVals) {
                                                var rets = retVals;
                                                chai_1.assert(!!rets);
                                                chai_1.assert.equal(rets.length, 1);
                                                chai_1.assert.equal(rets[0].id, "a5");
                                            });
                                        });
                                    });
                                });
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Remove range (inclusive low/high)", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) {
                            return { id: "a" + i };
                        }))
                            .then(function () {
                            return prov.getAll("test", undefined).then(function (rets) {
                                chai_1.assert(!!rets);
                                chai_1.assert.equal(rets.length, 10);
                                return prov.removeRange("test", "", "a3", "a7").then(function () {
                                    return prov.getAll("test", undefined).then(function (retVals) {
                                        var rets = retVals;
                                        chai_1.assert(!!rets);
                                        chai_1.assert.equal(rets.length, 5);
                                        chai_1.assert.equal(rets[0].id, "a1");
                                        chai_1.assert.equal(rets[1].id, "a10");
                                        chai_1.assert.equal(rets[2].id, "a2");
                                        chai_1.assert.equal(rets[3].id, "a8");
                                        chai_1.assert.equal(rets[4].id, "a9");
                                    });
                                });
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Remove range (exclusive low, inclusive high)", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) {
                            return { id: "a" + i };
                        }))
                            .then(function () {
                            return prov.getAll("test", undefined).then(function (rets) {
                                chai_1.assert(!!rets);
                                chai_1.assert.equal(rets.length, 10);
                                return prov
                                    .removeRange("test", "", "a3", "a7", true, false)
                                    .then(function () {
                                    return prov
                                        .getAll("test", undefined)
                                        .then(function (retVals) {
                                        var rets = retVals;
                                        chai_1.assert(!!rets);
                                        chai_1.assert.equal(rets.length, 6);
                                        chai_1.assert.equal(rets[0].id, "a1");
                                        chai_1.assert.equal(rets[1].id, "a10");
                                        chai_1.assert.equal(rets[2].id, "a2");
                                        chai_1.assert.equal(rets[3].id, "a3");
                                        chai_1.assert.equal(rets[4].id, "a8");
                                        chai_1.assert.equal(rets[5].id, "a9");
                                    });
                                });
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Remove range (inclusive low, exclusive high)", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) {
                            return { id: "a" + i };
                        }))
                            .then(function () {
                            return prov.getAll("test", undefined).then(function (rets) {
                                chai_1.assert(!!rets);
                                chai_1.assert.equal(rets.length, 10);
                                return prov
                                    .removeRange("test", "", "a3", "a7", false, true)
                                    .then(function () {
                                    return prov
                                        .getAll("test", undefined)
                                        .then(function (retVals) {
                                        var rets = retVals;
                                        chai_1.assert(!!rets);
                                        chai_1.assert.equal(rets.length, 6);
                                        chai_1.assert.equal(rets[0].id, "a1");
                                        chai_1.assert.equal(rets[1].id, "a10");
                                        chai_1.assert.equal(rets[2].id, "a2");
                                        chai_1.assert.equal(rets[3].id, "a7");
                                        chai_1.assert.equal(rets[4].id, "a8");
                                        chai_1.assert.equal(rets[5].id, "a9");
                                    });
                                });
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Remove range (exclusive low, exclusive high)", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) {
                            return { id: "a" + i };
                        }))
                            .then(function () {
                            return prov.getAll("test", undefined).then(function (rets) {
                                chai_1.assert(!!rets);
                                chai_1.assert.equal(rets.length, 10);
                                return prov
                                    .removeRange("test", "", "a3", "a7", true, true)
                                    .then(function () {
                                    return prov
                                        .getAll("test", undefined)
                                        .then(function (retVals) {
                                        var rets = retVals;
                                        chai_1.assert(!!rets);
                                        chai_1.assert.equal(rets.length, 7);
                                        chai_1.assert.equal(rets[0].id, "a1");
                                        chai_1.assert.equal(rets[1].id, "a10");
                                        chai_1.assert.equal(rets[2].id, "a2");
                                        chai_1.assert.equal(rets[3].id, "a3");
                                        chai_1.assert.equal(rets[4].id, "a7");
                                        chai_1.assert.equal(rets[5].id, "a8");
                                        chai_1.assert.equal(rets[6].id, "a9");
                                    });
                                });
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Remove range (nothing done)", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", [1, 2, 3, 4, 5].map(function (i) {
                            return { id: "a" + i };
                        }))
                            .then(function () {
                            return prov.getAll("test", undefined).then(function (rets) {
                                chai_1.assert(!!rets);
                                chai_1.assert.equal(rets.length, 5);
                                return prov.removeRange("test", "", "a6", "a9").then(function () {
                                    return prov.getAll("test", undefined).then(function (retVals) {
                                        var rets = retVals;
                                        chai_1.assert(!!rets);
                                        chai_1.assert.equal(rets.length, 5);
                                        chai_1.assert.equal(rets[0].id, "a1");
                                        chai_1.assert.equal(rets[1].id, "a2");
                                        chai_1.assert.equal(rets[2].id, "a3");
                                        chai_1.assert.equal(rets[3].id, "a4");
                                        chai_1.assert.equal(rets[4].id, "a5");
                                    });
                                });
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Remove range (all removed)", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", [1, 2, 3, 4, 5].map(function (i) {
                            return { id: "a" + i };
                        }))
                            .then(function () {
                            return prov.getAll("test", undefined).then(function (rets) {
                                chai_1.assert(!!rets);
                                chai_1.assert.equal(rets.length, 5);
                                return prov.removeRange("test", "", "a1", "a5").then(function () {
                                    return prov.getAll("test", undefined).then(function (retVals) {
                                        var rets = retVals;
                                        chai_1.assert(!!rets);
                                        chai_1.assert.equal(rets.length, 0);
                                    });
                                });
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Invalid Key Type", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", { id: { x: "a" }, val: "b" })
                            .then(function () {
                            return prov
                                .close()
                                .then(function () { return chai_1.assert(false, "Shouldn't get here"); });
                        }, function () {
                            // Woot, failed like it's supposed to
                            return prov.close();
                        })
                            .then(function () {
                            done();
                        });
                    })
                        .catch(function (err) {
                        done(err);
                    });
                });
                it("Primary Key Basic KeyPath", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "id",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return tester(prov, undefined, false, function (obj, v) {
                            obj.id = v;
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                var _loop_1 = function (i) {
                    it("Simple index put/get, getAll, getOnly, and getRange" +
                        (i === 0 ? "" : " (includeData)"), function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return tester(prov, "index", false, function (obj, v) {
                                obj.a = v;
                            })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                };
                for (var i = 0; i <= 1; i++) {
                    _loop_1(i);
                }
                it("Multipart primary key basic test", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: "a.b",
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return tester(prov, undefined, false, function (obj, v) {
                            obj.a = { b: v };
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Multipart index basic test", function (done) {
                    openProvider(provName, {
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
                    }, true)
                        .then(function (prov) {
                        return tester(prov, "index", false, function (obj, v) {
                            obj.a = { b: v };
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Compound primary key basic test", function (done) {
                    openProvider(provName, {
                        version: 1,
                        stores: [
                            {
                                name: "test",
                                primaryKeyPath: ["a", "b"],
                            },
                        ],
                    }, true)
                        .then(function (prov) {
                        return tester(prov, undefined, true, function (obj, v1, v2) {
                            obj.a = v1;
                            obj.b = v2;
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Compound index basic test", function (done) {
                    openProvider(provName, {
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
                    }, true)
                        .then(function (prov) {
                        return tester(prov, "index", true, function (obj, v1, v2) {
                            obj.a = v1;
                            obj.b = v2;
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                var _loop_2 = function (i) {
                    it("MultiEntry multipart indexed tests" +
                        (i === 0 ? "" : " (includeData)"), function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return (prov
                                .put("test", {
                                id: "a",
                                val: "b",
                                k: { k: ["w", "x", "y", "z"] },
                            })
                                // Insert data without multi-entry key defined
                                .then(function () {
                                return prov.put("test", { id: "c", val: "d", k: [] });
                            })
                                .then(function () { return prov.put("test", { id: "e", val: "f" }); })
                                .then(function () {
                                var g1 = prov.get("test", "a").then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.val, "b");
                                });
                                var g2 = prov.getAll("test", "key").then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 4);
                                    ret.forEach(function (r) {
                                        chai_1.assert.equal(r.val, "b");
                                    });
                                });
                                var g2b = prov
                                    .getAll("test", "key", false, 2)
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 2);
                                    ret.forEach(function (r) {
                                        chai_1.assert.equal(r.val, "b");
                                    });
                                });
                                var g2c = prov
                                    .getAll("test", "key", false, 2, 1)
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 2);
                                    ret.forEach(function (r) {
                                        chai_1.assert.equal(r.val, "b");
                                    });
                                });
                                var g3 = prov
                                    .getOnly("test", "key", "x")
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 1);
                                    chai_1.assert.equal(ret[0].val, "b");
                                });
                                var g4 = prov
                                    .getRange("test", "key", "x", "y", false, false)
                                    .then(function (retVal) {
                                    var ret = retVal;
                                    chai_1.assert.equal(ret.length, 2);
                                    ret.forEach(function (r) {
                                        chai_1.assert.equal(r.val, "b");
                                    });
                                });
                                return Promise.all([g1, g2, g2b, g2c, g3, g4]);
                            })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); }));
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                };
                for (var i = 0; i <= 1; i++) {
                    _loop_2(i);
                }
                it("MultiEntry multipart indexed - update index", function (done) {
                    openProvider(provName, {
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
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", {
                            id: "a",
                            val: "b",
                            k: { k: ["w", "x", "y", "z"] },
                        })
                            .then(function () {
                            return prov
                                .getRange("test", "key", "x", "y", false, false)
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 2);
                                ret.forEach(function (r) {
                                    chai_1.assert.equal(r.val, "b");
                                });
                            });
                        })
                            .then(function () {
                            return prov.put("test", {
                                id: "a",
                                val: "b",
                                k: { k: ["z"] },
                            });
                        })
                            .then(function () {
                            return prov
                                .getRange("test", "key", "x", "y", false, false)
                                .then(function (ret) {
                                chai_1.assert.equal(ret.length, 0);
                            });
                        })
                            .then(function () {
                            return prov
                                .getRange("test", "key", "x", "z", false, false)
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 1);
                                chai_1.assert.equal(ret[0].val, "b");
                            });
                        })
                            .then(function () {
                            return prov.remove("test", "a");
                        })
                            .then(function () {
                            return prov
                                .getRange("test", "key", "x", "z", false, false)
                                .then(function (ret) {
                                chai_1.assert.equal(ret.length, 0);
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("MultiEntry multipart indexed tests - getMultiple", function (done) {
                    openProvider(provName, {
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
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", {
                            id: "a",
                            id2: "1",
                            val: "b",
                            k: { k: ["w", "x", "y", "z"] },
                        })
                            .then(function () {
                            var g = prov
                                .getMultiple("test", ["x", "y"], "key")
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 2);
                                ret.forEach(function (r) {
                                    chai_1.assert.equal(r.val, "b");
                                });
                            });
                            var g1 = prov
                                .getMultiple("test", ["lala"], "key")
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 0);
                            });
                            return Promise.all([g, g1]);
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("MultiEntry multipart indexed tests - Compound Key", function (done) {
                    openProvider(provName, {
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
                    }, true)
                        .then(function (prov) {
                        return (prov
                            .put("test", {
                            id: "a",
                            id2: "1",
                            val: "b",
                            k: { k: ["w", "x", "y", "z"] },
                        })
                            // Insert data without multi-entry key defined
                            .then(function () {
                            return prov.put("test", { id: "c", id2: "2", val: "d", k: [] });
                        })
                            .then(function () { return prov.put("test", { id: "e", id2: "3", val: "f" }); })
                            .then(function () {
                            var g1 = prov.get("test", ["a", "1"]).then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.val, "b");
                            });
                            var g2 = prov.getAll("test", "key").then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 4);
                                ret.forEach(function (r) {
                                    chai_1.assert.equal(r.val, "b");
                                });
                            });
                            var g2b = prov
                                .getAll("test", "key", false, 2)
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 2);
                                ret.forEach(function (r) {
                                    chai_1.assert.equal(r.val, "b");
                                });
                            });
                            var g2c = prov
                                .getAll("test", "key", false, 2, 1)
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 2);
                                ret.forEach(function (r) {
                                    chai_1.assert.equal(r.val, "b");
                                });
                            });
                            var g3 = prov.getOnly("test", "key", "x").then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 1);
                                chai_1.assert.equal(ret[0].val, "b");
                            });
                            var g4 = prov
                                .getRange("test", "key", "x", "y", false, false)
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 2);
                                ret.forEach(function (r) {
                                    chai_1.assert.equal(r.val, "b");
                                });
                            });
                            return Promise.all([g1, g2, g2b, g2c, g3, g4]);
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); }));
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("MultiEntry multipart indexed - update index - Compound", function (done) {
                    openProvider(provName, {
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
                    }, true)
                        .then(function (prov) {
                        return prov
                            .put("test", {
                            id: "a",
                            id2: "1",
                            val: "b",
                            k: { k: ["w", "x", "y", "z"] },
                        })
                            .then(function () {
                            return prov
                                .getRange("test", "key", "x", "y", false, false)
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 2);
                                ret.forEach(function (r) {
                                    chai_1.assert.equal(r.val, "b");
                                });
                            });
                        })
                            .then(function () {
                            return prov.put("test", {
                                id: "a",
                                id2: "1",
                                val: "b",
                                k: { k: ["z"] },
                            });
                        })
                            .then(function () {
                            return prov
                                .getRange("test", "key", "x", "y", false, false)
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 0);
                            });
                        })
                            .then(function () {
                            return prov
                                .getRange("test", "key", "x", "z", false, false)
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 1);
                                chai_1.assert.equal(ret[0].val, "b");
                            });
                        })
                            .then(function () {
                            return prov.remove("test", ["a", "1"]);
                        })
                            .then(function () {
                            return prov
                                .getRange("test", "key", "x", "z", false, false)
                                .then(function (retVal) {
                                var ret = retVal;
                                chai_1.assert.equal(ret.length, 0);
                            });
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                it("Simple non-unique index put/get, getAll, getOnly, and getRange (includeData)", function (done) {
                    openProvider(provName, {
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
                    }, true)
                        .then(function (prov) {
                        return nonUniqueTester(prov, "index", false, function (obj, v) {
                            obj.a = v;
                        })
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    })
                        .then(function () { return done(); }, function (err) { return done(err); });
                });
                describe("Transaction Semantics", function () {
                    it("Testing transaction expiration", function (done) {
                        openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov
                                .openTransaction(["test"], true)
                                .then(function (trans) {
                                var promise = trans.getCompletionPromise();
                                var check1 = false;
                                promise.then(function () {
                                    check1 = true;
                                }, function () {
                                    chai_1.assert.ok(false, "Bad");
                                });
                                return sleep(200).then(function () {
                                    chai_1.assert.ok(check1);
                                    var store = trans.getStore("test");
                                    return store.put({ id: "abc", a: "a" });
                                });
                            })
                                .then(function () {
                                chai_1.assert.ok(false, "Should fail");
                                return Promise.reject();
                            }, function () {
                                // woot
                                return undefined;
                            })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Testing aborting", function (done) {
                        openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            var checked = false;
                            return prov
                                .openTransaction(["test"], true)
                                .then(function (trans) {
                                var promise = trans.getCompletionPromise();
                                var store = trans.getStore("test");
                                return store.put({ id: "abc", a: "a" }).then(function () {
                                    trans.abort();
                                    return promise.then(function () {
                                        chai_1.assert.ok(false, "Should fail");
                                    }, function () {
                                        return prov.get("test", "abc").then(function (res) {
                                            chai_1.assert.ok(!res);
                                            checked = true;
                                        });
                                    });
                                });
                            })
                                .then(function () {
                                chai_1.assert.ok(checked);
                            })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            done();
                        });
                    });
                    it("Testing read/write transaction locks", function (done) {
                        openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", a: "a" })
                                .then(function () {
                                var check1 = false, check2 = false;
                                var started1 = false;
                                var closed1 = false;
                                var p1 = prov
                                    .openTransaction(["test"], true)
                                    .then(function (trans) {
                                    trans.getCompletionPromise().then(function () {
                                        closed1 = true;
                                    });
                                    started1 = true;
                                    var store = trans.getStore("test");
                                    return store.put({ id: "abc", a: "b" }).then(function () {
                                        return store.get("abc").then(function (val) {
                                            chai_1.assert.ok(val && val.a === "b");
                                            chai_1.assert.ok(!closed1);
                                            check1 = true;
                                        });
                                    });
                                });
                                chai_1.assert.ok(!closed1);
                                var p2 = prov
                                    .openTransaction(["test"], false)
                                    .then(function (trans) {
                                    chai_1.assert.ok(closed1);
                                    chai_1.assert.ok(started1 && check1);
                                    var store = trans.getStore("test");
                                    return store.get("abc").then(function (val) {
                                        chai_1.assert.ok(val && val.a === "b");
                                        check2 = true;
                                    });
                                });
                                return Promise.all([p1, p2]).then(function () {
                                    chai_1.assert.ok(check1 && check2);
                                });
                            })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                });
            });
            if (provName.indexOf("memory") === -1) {
                describe("Schema Upgrades", function () {
                    it("Opening an older DB version", function (done) {
                        openProvider(provName, {
                            version: 2,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov.close();
                        })
                            .then(function () {
                            return openProvider(provName, {
                                version: 1,
                                stores: [
                                    {
                                        name: "test2",
                                        primaryKeyPath: "id",
                                    },
                                ],
                            }, false).then(function (prov) {
                                return prov.get("test", "abc").then(function () {
                                    return prov.close().then(function () {
                                        return Promise.reject("Shouldn't have worked");
                                    });
                                }, function () {
                                    // Expected to fail, so chain from failure to success
                                    return prov.close();
                                });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Basic NOOP schema upgrade path", function (done) {
                        openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
                                version: 2,
                                stores: [
                                    {
                                        name: "test",
                                        primaryKeyPath: "id",
                                    },
                                ],
                            }, false).then(function (prov) {
                                return prov
                                    .get("test", "abc")
                                    .then(function (item) {
                                    chai_1.assert(!!item);
                                })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Adding new store", function (done) {
                        openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                return prov
                                    .put("test2", { id: "def", ttt: "ghi" })
                                    .then(function () {
                                    var p1 = prov.get("test", "abc").then(function (itemVal) {
                                        var item = itemVal;
                                        chai_1.assert(!!item);
                                        chai_1.assert.equal(item.id, "abc");
                                    });
                                    var p2 = prov.get("test2", "abc").then(function (item) {
                                        chai_1.assert(!item);
                                    });
                                    var p3 = prov.get("test2", "def").then(function (item) {
                                        chai_1.assert(!item);
                                    });
                                    var p4 = prov.get("test2", "ghi").then(function (itemVal) {
                                        var item = itemVal;
                                        chai_1.assert(!!item);
                                        chai_1.assert.equal(item.id, "def");
                                    });
                                    return Promise.all([p1, p2, p3, p4]);
                                })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Removing old store", function (done) {
                        openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
                                version: 2,
                                stores: [
                                    {
                                        name: "test2",
                                        primaryKeyPath: "id",
                                    },
                                ],
                            }, false).then(function (prov) {
                                return prov.get("test", "abc").then(function () {
                                    return prov.close().then(function () {
                                        return Promise.reject("Shouldn't have worked");
                                    });
                                }, function () {
                                    // Expected to fail, so chain from failure to success
                                    return prov.close();
                                });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Remove store with index", function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", tt: "abc" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
                                version: 2,
                                stores: [
                                    {
                                        name: "test2",
                                        primaryKeyPath: "id",
                                    },
                                ],
                            }, false).then(function (prov) {
                                return prov.get("test", "abc").then(function () {
                                    return prov.close().then(function () {
                                        return Promise.reject("Shouldn't have worked");
                                    });
                                }, function () {
                                    // Expected to fail, so chain from failure to success
                                    return prov.close();
                                });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Add index", function (done) {
                        openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", tt: "a" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                var p1 = prov
                                    .getOnly("test", "ind1", "a")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                    chai_1.assert.equal(items[0].tt, "a");
                                });
                                var p2 = prov
                                    .getOnly("test", undefined, "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                    chai_1.assert.equal(items[0].tt, "a");
                                });
                                var p3 = prov
                                    .getOnly("test", "ind1", "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 0);
                                });
                                return Promise.all([p1, p2, p3])
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    function testBatchUpgrade(itemByteSize) {
                        var recordCount = 5000;
                        var data = {};
                        lodash_1.times(recordCount, function (num) {
                            data[num.toString()] = {
                                id: num.toString(),
                                tt: "tt" + num.toString(),
                            };
                        });
                        return openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                    estimatedObjBytes: itemByteSize,
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", lodash_1.values(data))
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                return prov
                                    .getAll("test", undefined)
                                    .then(function (records) {
                                    chai_1.assert.equal(records.length, lodash_1.keys(data).length, "Incorrect record count");
                                    lodash_1.each(records, function (dbRecordToValidate) {
                                        var originalRecord = data[dbRecordToValidate.id];
                                        chai_1.assert.ok(!!originalRecord);
                                        chai_1.assert.equal(originalRecord.id, dbRecordToValidate.id);
                                        chai_1.assert.equal(originalRecord.tt, dbRecordToValidate.tt);
                                    });
                                })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        });
                    }
                    it("Add index - Large records - batched upgrade", function (done) {
                        testBatchUpgrade(10000).then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Add index - small records - No batch upgrade", function (done) {
                        testBatchUpgrade(1).then(function () { return done(); }, function (err) { return done(err); });
                    });
                    if (provName.indexOf("indexeddb") !== 0) {
                        // This migration works on indexeddb because we don't check the types and the browsers silently accept it but just
                        // neglect to index the field...
                        it("Add index to boolean field should fail", function (done) {
                            openProvider(provName, {
                                version: 1,
                                stores: [
                                    {
                                        name: "test",
                                        primaryKeyPath: "id",
                                    },
                                ],
                            }, true)
                                .then(function (prov) {
                                return prov
                                    .put("test", { id: "abc", tt: true })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            })
                                .then(function () {
                                return openProvider(provName, {
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
                                }, false).then(function (prov) {
                                    return prov
                                        .close()
                                        .then(function () { return Promise.reject("Should not work"); });
                                }, function () {
                                    return Promise.resolve();
                                });
                            })
                                .then(function () { return done(); }, function (err) { return done(err); });
                        });
                    }
                    it("Add multiEntry index", function (done) {
                        openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", tt: ["a", "b"] })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                var p1 = prov
                                    .getOnly("test", "ind1", "a")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p1b = prov
                                    .getOnly("test", "ind1", "b")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p2 = prov
                                    .getOnly("test", undefined, "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p3 = prov
                                    .getOnly("test", "ind1", "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 0);
                                });
                                return Promise.all([p1, p1b, p2, p3])
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Changing multiEntry index", function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", tt: ["x", "y"], ttb: ["a", "b"] })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                var p1 = prov
                                    .getOnly("test", "ind1", "a")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p1b = prov
                                    .getOnly("test", "ind1", "b")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p1c = prov
                                    .getOnly("test", "ind1", "x")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 0);
                                });
                                var p2 = prov
                                    .getOnly("test", undefined, "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p3 = prov
                                    .getOnly("test", "ind1", "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 0);
                                });
                                return Promise.all([p1, p1b, p1c, p2, p3])
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Removing old index", function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", tt: "a" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
                                version: 2,
                                stores: [
                                    {
                                        name: "test",
                                        primaryKeyPath: "id",
                                    },
                                ],
                            }, false).then(function (prov) {
                                return prov.getOnly("test", "ind1", "a").then(function () {
                                    return prov.close().then(function () {
                                        return Promise.reject("Shouldn't have worked");
                                    });
                                }, function () {
                                    // Expected to fail, so chain from failure to success
                                    return prov.close();
                                });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Changing index keypath", function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", tt: "a", ttb: "b" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                var p1 = prov.getOnly("test", "ind1", "a").then(function (items) {
                                    chai_1.assert.equal(items.length, 0);
                                });
                                var p2 = prov
                                    .getOnly("test", "ind1", "b")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].ttb, "b");
                                });
                                var p3 = prov
                                    .getOnly("test", "ind1", "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 0);
                                });
                                return Promise.all([p1, p2, p3])
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Change non-multientry index to includeDataInIndex", function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return prov.put("test", { id: "abc", tt: "a" }).then(function () {
                                return prov.close();
                            });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                var p1 = prov
                                    .getOnly("test", "ind1", "a")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                    chai_1.assert.equal(items[0].tt, "a");
                                });
                                var p2 = prov
                                    .getOnly("test", undefined, "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                    chai_1.assert.equal(items[0].tt, "a");
                                });
                                var p3 = prov
                                    .getOnly("test", "ind1", "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 0);
                                });
                                return Promise.all([p1, p2, p3])
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Change non-multientry index from includeDataInIndex", function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", tt: "a" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                var p1 = prov
                                    .getOnly("test", "ind1", "a")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                    chai_1.assert.equal(items[0].tt, "a");
                                });
                                var p2 = prov
                                    .getOnly("test", undefined, "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                    chai_1.assert.equal(items[0].tt, "a");
                                });
                                var p3 = prov
                                    .getOnly("test", "ind1", "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 0);
                                });
                                return Promise.all([p1, p2, p3])
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Change multientry index to includeDataInIndex", function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", tt: ["a", "b"] })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                var p1 = prov
                                    .getOnly("test", "ind1", "a")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p1b = prov
                                    .getOnly("test", "ind1", "b")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p2 = prov
                                    .getOnly("test", undefined, "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p3 = prov
                                    .getOnly("test", "ind1", "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 0);
                                });
                                return Promise.all([p1, p1b, p2, p3])
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Change multientry index from includeDataInIndex", function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", tt: ["a", "b"] })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                var p1 = prov
                                    .getOnly("test", "ind1", "a")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p1b = prov
                                    .getOnly("test", "ind1", "b")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p2 = prov
                                    .getOnly("test", undefined, "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                var p3 = prov
                                    .getOnly("test", "ind1", "abc")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 0);
                                });
                                return Promise.all([p1, p1b, p2, p3])
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Adding new FTS store", function (done) {
                        openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                return prov
                                    .put("test2", { id: "def", content: "ghi" })
                                    .then(function () {
                                    var p1 = prov.get("test", "abc").then(function (item) {
                                        chai_1.assert.ok(item);
                                        chai_1.assert.equal(item.id, "abc");
                                    });
                                    var p2 = prov.get("test2", "abc").then(function (item) {
                                        chai_1.assert.ok(!item);
                                    });
                                    var p3 = prov.get("test2", "def").then(function (item) {
                                        chai_1.assert.ok(item);
                                    });
                                    var p4 = prov
                                        .fullTextSearch("test2", "a", "ghi")
                                        .then(function (items) {
                                        chai_1.assert.equal(items.length, 1);
                                        chai_1.assert.equal(items[0].id, "def");
                                    });
                                    return Promise.all([p1, p2, p3, p4])
                                        .then(function () { return prov.close(); })
                                        .catch(function (e) {
                                        return prov.close().then(function () { return Promise.reject(e); });
                                    });
                                });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Adding new FTS index", function (done) {
                        openProvider(provName, {
                            version: 1,
                            stores: [
                                {
                                    name: "test",
                                    primaryKeyPath: "id",
                                },
                            ],
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", content: "ghi" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
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
                            }, false).then(function (prov) {
                                var p1 = prov.get("test", "abc").then(function (item) {
                                    chai_1.assert.ok(item);
                                    chai_1.assert.equal(item.id, "abc");
                                });
                                var p2 = prov
                                    .fullTextSearch("test", "a", "ghi")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                });
                                return Promise.all([p1, p2])
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    it("Removing FTS index", function (done) {
                        openProvider(provName, {
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
                        }, true)
                            .then(function (prov) {
                            return prov
                                .put("test", { id: "abc", content: "ghi" })
                                .then(function () { return prov.close(); })
                                .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                        })
                            .then(function () {
                            return openProvider(provName, {
                                version: 2,
                                stores: [
                                    {
                                        name: "test",
                                        primaryKeyPath: "id",
                                    },
                                ],
                            }, false).then(function (prov) {
                                var p1 = prov.get("test", "abc").then(function (item) {
                                    chai_1.assert.ok(item);
                                    chai_1.assert.equal(item.id, "abc");
                                    chai_1.assert.equal(item.content, "ghi");
                                });
                                var p2 = prov
                                    .fullTextSearch("test", "a", "ghi")
                                    .then(function (items) {
                                    chai_1.assert.equal(items.length, 1);
                                    chai_1.assert.equal(items[0].id, "abc");
                                })
                                    .then(function () {
                                    chai_1.assert.ok(false, "should not work");
                                }, function () {
                                    return Promise.resolve();
                                });
                                return Promise.all([p1, p2])
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            });
                        })
                            .then(function () { return done(); }, function (err) { return done(err); });
                    });
                    // indexed db might backfill anyway behind the scenes
                    if (provName.indexOf("indexeddb") !== 0) {
                        it("Adding an index that does not require backfill", function (done) {
                            return openProvider(provName, {
                                version: 1,
                                stores: [
                                    {
                                        name: "test",
                                        primaryKeyPath: "id",
                                    },
                                ],
                            }, true)
                                .then(function (prov) {
                                return prov
                                    .put("test", { id: "abc", tt: "a" })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            })
                                .then(function () {
                                return openProvider(provName, {
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
                                }, false).then(function (prov) {
                                    return prov.put("test", { id: "bcd", tt: "b" }).then(function () {
                                        var p1 = prov
                                            .getOnly("test", "ind1", "a")
                                            .then(function (items) {
                                            // item not found, we didn't backfill the first item
                                            chai_1.assert.equal(items.length, 0);
                                        });
                                        var p2 = prov
                                            .getOnly("test", undefined, "abc")
                                            .then(function (items) {
                                            chai_1.assert.equal(items.length, 1);
                                            chai_1.assert.equal(items[0].id, "abc");
                                            chai_1.assert.equal(items[0].tt, "a");
                                        });
                                        var p3 = prov
                                            .getOnly("test", "ind1", "b")
                                            .then(function (items) {
                                            // index works properly for the new item
                                            chai_1.assert.equal(items.length, 1);
                                            chai_1.assert.equal(items[0].id, "bcd");
                                            chai_1.assert.equal(items[0].tt, "b");
                                        });
                                        return Promise.all([p1, p2, p3])
                                            .then(function () { return prov.close(); })
                                            .catch(function (e) {
                                            return prov.close().then(function () { return Promise.reject(e); });
                                        });
                                    });
                                });
                            })
                                .then(function () { return done(); }, function (err) { return done(err); });
                        });
                        it("Adding two indexes at once - backfill and not", function (done) {
                            openProvider(provName, {
                                version: 1,
                                stores: [
                                    {
                                        name: "test",
                                        primaryKeyPath: "id",
                                    },
                                ],
                            }, true)
                                .then(function (prov) {
                                return prov
                                    .put("test", { id: "abc", tt: "a", zz: "b" })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            })
                                .then(function () {
                                return openProvider(provName, {
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
                                }, false).then(function (prov) {
                                    var p1 = prov
                                        .getOnly("test", "ind1", "a")
                                        .then(function (items) {
                                        // we had to backfill, so we filled all
                                        chai_1.assert.equal(items.length, 1);
                                        chai_1.assert.equal(items[0].id, "abc");
                                        chai_1.assert.equal(items[0].tt, "a");
                                        chai_1.assert.equal(items[0].zz, "b");
                                    });
                                    var p2 = prov
                                        .getOnly("test", undefined, "abc")
                                        .then(function (items) {
                                        chai_1.assert.equal(items.length, 1);
                                        chai_1.assert.equal(items[0].id, "abc");
                                        chai_1.assert.equal(items[0].tt, "a");
                                        chai_1.assert.equal(items[0].zz, "b");
                                    });
                                    var p3 = prov
                                        .getOnly("test", "ind2", "b")
                                        .then(function (items) {
                                        // index works properly for the second index
                                        chai_1.assert.equal(items.length, 1);
                                        chai_1.assert.equal(items[0].id, "abc");
                                        chai_1.assert.equal(items[0].tt, "a");
                                        chai_1.assert.equal(items[0].zz, "b");
                                    });
                                    return Promise.all([p1, p2, p3])
                                        .then(function () { return prov.close(); })
                                        .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                                });
                            })
                                .then(function () { return done(); }, function (err) { return done(err); });
                        });
                        it("Change no backfill index into a normal index", function (done) {
                            openProvider(provName, {
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
                            }, true)
                                .then(function (prov) {
                                return prov
                                    .put("test", { id: "abc", tt: "a", zz: "b" })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            })
                                .then(function () {
                                return openProvider(provName, {
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
                                }, false).then(function (prov) {
                                    var p1 = prov
                                        .getOnly("test", "ind1", "a")
                                        .then(function (items) {
                                        // we backfilled
                                        chai_1.assert.equal(items.length, 1);
                                        chai_1.assert.equal(items[0].id, "abc");
                                        chai_1.assert.equal(items[0].tt, "a");
                                        chai_1.assert.equal(items[0].zz, "b");
                                    });
                                    var p2 = prov
                                        .getOnly("test", undefined, "abc")
                                        .then(function (items) {
                                        chai_1.assert.equal(items.length, 1);
                                        chai_1.assert.equal(items[0].id, "abc");
                                        chai_1.assert.equal(items[0].tt, "a");
                                        chai_1.assert.equal(items[0].zz, "b");
                                    });
                                    return Promise.all([p1, p2])
                                        .then(function () { return prov.close(); })
                                        .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                                });
                            })
                                .then(function () { return done(); }, function (err) { return done(err); });
                        });
                        it("Perform two updates which require no backfill", function (done) {
                            openProvider(provName, {
                                version: 1,
                                stores: [
                                    {
                                        name: "test",
                                        primaryKeyPath: "id",
                                    },
                                ],
                            }, true)
                                .then(function (prov) {
                                return prov
                                    .put("test", { id: "abc", tt: "a", zz: "aa" })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            })
                                .then(function () {
                                return openProvider(provName, {
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
                                }, false).then(function (prov) {
                                    return prov
                                        .put("test", { id: "bcd", tt: "b", zz: "bb" })
                                        .then(function () { return prov.close(); })
                                        .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                                });
                            })
                                .then(function () {
                                return openProvider(provName, {
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
                                }, false).then(function (prov) {
                                    var p1 = prov
                                        .getOnly("test", "ind1", "a")
                                        .then(function (items) {
                                        // item not found, we didn't backfill the first item
                                        chai_1.assert.equal(items.length, 0);
                                    });
                                    var p2 = prov
                                        .getOnly("test", undefined, "abc")
                                        .then(function (items) {
                                        chai_1.assert.equal(items.length, 1);
                                        chai_1.assert.equal(items[0].id, "abc");
                                        chai_1.assert.equal(items[0].tt, "a");
                                        chai_1.assert.equal(items[0].zz, "aa");
                                    });
                                    var p3 = prov
                                        .getOnly("test", "ind1", "b")
                                        .then(function (items) {
                                        // first index works properly for the second item
                                        chai_1.assert.equal(items.length, 1);
                                        chai_1.assert.equal(items[0].id, "bcd");
                                        chai_1.assert.equal(items[0].tt, "b");
                                    });
                                    var p4 = prov
                                        .getOnly("test", "ind2", "bb")
                                        .then(function (items) {
                                        // second index wasn't backfilled
                                        chai_1.assert.equal(items.length, 0);
                                    });
                                    return Promise.all([p1, p2, p3, p4])
                                        .then(function () { return prov.close(); })
                                        .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                                });
                            })
                                .then(function () { return done(); }, function (err) { return done(err); });
                        });
                        it("Removes index without pulling data to JS", function (done) {
                            openProvider(provName, {
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
                            }, true)
                                .then(function (prov) {
                                return prov
                                    .put("test", { id: "abc", content: "ghi" })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            })
                                .then(function () {
                                return openProvider(provName, {
                                    version: 2,
                                    stores: [
                                        {
                                            name: "test",
                                            primaryKeyPath: "id",
                                        },
                                    ],
                                }, false).then(function (prov) {
                                    // check the index was actually removed
                                    var p1 = prov.get("test", "abc").then(function (item) {
                                        chai_1.assert.ok(item);
                                        chai_1.assert.equal(item.id, "abc");
                                        chai_1.assert.equal(item.content, "ghi");
                                    });
                                    var p2 = prov
                                        .getOnly("test", "ind1", "ghi")
                                        .then(function (items) {
                                        chai_1.assert.equal(items.length, 1);
                                        chai_1.assert.equal(items[0].id, "abc");
                                    })
                                        .then(function () {
                                        chai_1.assert.ok(false, "should not work");
                                    }, function () {
                                        return Promise.resolve();
                                    });
                                    return Promise.all([p1, p2])
                                        .then(function () { return prov.close(); })
                                        .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                                });
                            })
                                .then(function () { return done(); }, function (err) { return done(err); });
                        });
                        it("Add and remove index in the same upgrade", function (done) {
                            openProvider(provName, {
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
                            }, true)
                                .then(function (prov) {
                                return prov
                                    .put("test", { id: "abc", tt: "a", zz: "aa" })
                                    .then(function () { return prov.close(); })
                                    .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                            })
                                .then(function () {
                                return openProvider(provName, {
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
                                }, false).then(function (prov) {
                                    var p1 = prov
                                        .getOnly("test", undefined, "abc")
                                        .then(function (items) {
                                        chai_1.assert.equal(items.length, 1);
                                        chai_1.assert.equal(items[0].id, "abc");
                                        chai_1.assert.equal(items[0].tt, "a");
                                        chai_1.assert.equal(items[0].zz, "aa");
                                    });
                                    var p2 = prov.getOnly("test", "ind1", "a").then(function () {
                                        return Promise.reject("Shouldn't have worked");
                                    }, function () {
                                        // Expected to fail, so chain from failure to success
                                        return undefined;
                                    });
                                    return Promise.all([p1, p2])
                                        .then(function () { return prov.close(); })
                                        .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                                });
                            })
                                .then(function () { return done(); }, function (err) { return done(err); });
                        });
                    }
                });
            }
            it("Full Text Index", function (done) {
                openProvider(provName, {
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
                }, true)
                    .then(function (prov) {
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
                            txt: "Бывает проснешься как птица," +
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
                        .then(function () {
                        var p1 = prov
                            .fullTextSearch("test", "i", "brown")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p2 = prov
                            .fullTextSearch("test", "i", "dog")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 2);
                        });
                        var p3 = prov
                            .fullTextSearch("test", "i", "do")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 2);
                        });
                        var p4 = prov
                            .fullTextSearch("test", "i", "LiKe")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a2");
                        });
                        var p5 = prov
                            .fullTextSearch("test", "i", "azy")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 0);
                        });
                        var p6 = prov
                            .fullTextSearch("test", "i", "lazy dog")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p7 = prov
                            .fullTextSearch("test", "i", "dog lazy")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p8 = prov
                            .fullTextSearch("test", "i", "DOG lăzy")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p9 = prov
                            .fullTextSearch("test", "i", "lĄzy")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p10 = prov
                            .fullTextSearch("test", "i", "brown brown brown")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p11 = prov
                            .fullTextSearch("test", "i", "brown brOwn browN")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p12 = prov
                            .fullTextSearch("test", "i", "brow")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p13 = prov
                            .fullTextSearch("test", "i", "bro")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p14 = prov
                            .fullTextSearch("test", "i", "br")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p15 = prov
                            .fullTextSearch("test", "i", "b")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 2);
                        });
                        var p16 = prov
                            .fullTextSearch("test", "i", "b z")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 0);
                        });
                        var p17 = prov
                            .fullTextSearch("test", "i", "b z", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 2);
                            chai_1.assert.ok(lodash_1.some(res, function (r) { return r.id === "a1"; }) &&
                                lodash_1.some(res, function (r) { return r.id === "a2"; }));
                        });
                        var p18 = prov
                            .fullTextSearch("test", "i", "q h", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 2);
                            chai_1.assert.ok(lodash_1.some(res, function (r) { return r.id === "a1"; }) &&
                                lodash_1.some(res, function (r) { return r.id === "a2"; }));
                        });
                        var p19 = prov
                            .fullTextSearch("test", "i", "fox nopers", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                            chai_1.assert.equal(res[0].id, "a1");
                        });
                        var p20 = prov
                            .fullTextSearch("test", "i", "foxers nopers", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 0);
                        });
                        var p21 = prov
                            .fullTextSearch("test", "i", "fox)", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                        });
                        var p22 = prov
                            .fullTextSearch("test", "i", "fox*", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                        });
                        var p23 = prov
                            .fullTextSearch("test", "i", "fox* fox( <fox>", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                        });
                        var p24 = prov
                            .fullTextSearch("test", "i", "f)ox", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 0);
                        });
                        var p25 = prov
                            .fullTextSearch("test", "i", "fo*x", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 0);
                        });
                        var p26 = prov
                            .fullTextSearch("test", "i", "tes>ter", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                        });
                        var p27 = prov
                            .fullTextSearch("test", "i", "f*x", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 0);
                        });
                        var p28 = prov
                            .fullTextSearch("test", "i", "бывает", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                        });
                        var p29 = prov
                            .fullTextSearch("test", "i", "漁", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                        });
                        var p30 = prov
                            .fullTextSearch("test", "i", "߂i18nDigits߂", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 1);
                        });
                        // This is an empty string test. All special symbols will be replaced so this is technically empty string search.
                        var p31 = prov
                            .fullTextSearch("test", "i", "!@#$%$", ObjectStoreProvider_1.FullTextTermResolution.Or)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 0);
                        });
                        var p32 = prov
                            .fullTextSearch("test", "i", "mark")
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 2);
                            chai_1.assert.ok(lodash_1.some(res, function (r) { return r.id === "a8"; }) &&
                                lodash_1.some(res, function (r) { return r.id === "a9"; }));
                        });
                        var p33 = prov
                            .fullTextSearch("test", "i", "mark", ObjectStoreProvider_1.FullTextTermResolution.Or, 10)
                            .then(function (res) {
                            chai_1.assert.equal(res.length, 2);
                            chai_1.assert.ok(lodash_1.some(res, function (r) { return r.id === "a8"; }) &&
                                lodash_1.some(res, function (r) { return r.id === "a9"; }));
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
                            .then(function () { return prov.close(); })
                            .catch(function (e) { return prov.close().then(function () { return Promise.reject(e); }); });
                    });
                })
                    .then(function () { return done(); }, function (err) { return done(err); });
            });
        });
    });
});
//# sourceMappingURL=ObjectStoreProvider.spec.js.map