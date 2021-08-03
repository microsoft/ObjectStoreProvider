"use strict";
/**
 * InMemoryProvider.ts
 * Author: David de Regt
 * Copyright: Microsoft 2015
 *
 * ObjectStoreProvider provider setup for a non-persisted in-memory database backing provider.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryProvider = void 0;
var lodash_1 = require("lodash");
var FullTextSearchHelpers_1 = require("./FullTextSearchHelpers");
var ObjectStoreProvider_1 = require("./ObjectStoreProvider");
var ObjectStoreProviderUtils_1 = require("./ObjectStoreProviderUtils");
var TransactionLockHelper_1 = require("./TransactionLockHelper");
var sorted_btree_1 = require("sorted-btree");
// Very simple in-memory dbprov ider for handling IE inprivate windows (and unit tests, maybe?)
var InMemoryProvider = /** @class */ (function (_super) {
    __extends(InMemoryProvider, _super);
    function InMemoryProvider() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this._stores = new Map();
        return _this;
    }
    InMemoryProvider.prototype.open = function (dbName, schema, wipeIfExists, verbose) {
        var _this = this;
        _super.prototype.open.call(this, dbName, schema, wipeIfExists, verbose);
        lodash_1.each(this._schema.stores, function (storeSchema) {
            _this._stores.set(storeSchema.name, {
                schema: storeSchema,
                data: new Map(),
                indices: new Map(),
            });
        });
        this._lockHelper = new TransactionLockHelper_1.TransactionLockHelper(schema, true);
        return Promise.resolve(void 0);
    };
    InMemoryProvider.prototype._deleteDatabaseInternal = function () {
        return Promise.resolve();
    };
    InMemoryProvider.prototype.openTransaction = function (storeNames, writeNeeded) {
        var _this = this;
        return this._lockHelper.openTransaction(storeNames, writeNeeded).then(function (token) {
            return new InMemoryTransaction(_this, _this._lockHelper, token, writeNeeded);
        });
    };
    InMemoryProvider.prototype.close = function () {
        var _this = this;
        return this._lockHelper.closeWhenPossible().then(function () {
            _this._stores = new Map();
        });
    };
    InMemoryProvider.prototype.internal_getStore = function (name) {
        return this._stores.get(name);
    };
    return InMemoryProvider;
}(ObjectStoreProvider_1.DbProvider));
exports.InMemoryProvider = InMemoryProvider;
// Notes: Doesn't limit the stores it can fetch to those in the stores it was "created" with, nor does it handle read-only transactions
var InMemoryTransaction = /** @class */ (function () {
    function InMemoryTransaction(_prov, _lockHelper, _transToken, writeNeeded) {
        var _this = this;
        this._prov = _prov;
        this._lockHelper = _lockHelper;
        this._transToken = _transToken;
        this._stores = new Map();
        // Close the transaction on the next tick.  By definition, anything is completed synchronously here, so after an event tick
        // goes by, there can't have been anything pending.
        if (writeNeeded) {
            this._openTimer = setTimeout(function () {
                _this._openTimer = undefined;
                _this._commitTransaction();
                _this._lockHelper.transactionComplete(_this._transToken);
            }, 0);
        }
        else {
            this._openTimer = undefined;
            this._commitTransaction();
            this._lockHelper.transactionComplete(this._transToken);
        }
    }
    InMemoryTransaction.prototype._commitTransaction = function () {
        this._stores.forEach(function (store) {
            store.internal_commitPendingData();
        });
    };
    InMemoryTransaction.prototype.getCompletionPromise = function () {
        return this._transToken.completionPromise;
    };
    InMemoryTransaction.prototype.abort = function () {
        this._stores.forEach(function (store) {
            store.internal_rollbackPendingData();
        });
        if (this._openTimer) {
            clearTimeout(this._openTimer);
            this._openTimer = undefined;
        }
        this._lockHelper.transactionFailed(this._transToken, "InMemoryTransaction Aborted");
    };
    InMemoryTransaction.prototype.markCompleted = function () {
        // noop
    };
    InMemoryTransaction.prototype.getStore = function (storeName) {
        if (!lodash_1.includes(ObjectStoreProviderUtils_1.arrayify(this._transToken.storeNames), storeName)) {
            throw new Error("Store not found in transaction-scoped store list: " + storeName);
        }
        if (this._stores.has(storeName)) {
            return this._stores.get(storeName);
        }
        var store = this._prov.internal_getStore(storeName);
        if (!store) {
            throw new Error("Store not found: " + storeName);
        }
        var ims = new InMemoryStore(this, store);
        this._stores.set(storeName, ims);
        return ims;
    };
    InMemoryTransaction.prototype.internal_isOpen = function () {
        return !!this._openTimer;
    };
    return InMemoryTransaction;
}());
var InMemoryStore = /** @class */ (function () {
    function InMemoryStore(_trans, storeInfo) {
        this._trans = _trans;
        this._storeSchema = storeInfo.schema;
        this._committedStoreData = new Map(storeInfo.data);
        this._indices = storeInfo.indices;
        this._mergedData = storeInfo.data;
    }
    InMemoryStore.prototype.internal_commitPendingData = function () {
        this._committedStoreData = new Map(this._mergedData);
        // Indices were already updated, theres no need to update them now.
    };
    InMemoryStore.prototype.internal_rollbackPendingData = function () {
        var _this = this;
        this._mergedData.clear();
        this._committedStoreData.forEach(function (val, key) {
            _this._mergedData.set(key, val);
        });
        // Recreate all indexes on a roll back.
        lodash_1.each(this._storeSchema.indexes, function (index) {
            _this._indices.set(index.name, new InMemoryIndex(_this._mergedData, index, _this._storeSchema.primaryKeyPath));
        });
    };
    InMemoryStore.prototype.get = function (key) {
        var _this = this;
        var joinedKey = lodash_1.attempt(function () {
            return ObjectStoreProviderUtils_1.serializeKeyToString(key, _this._storeSchema.primaryKeyPath);
        });
        if (lodash_1.isError(joinedKey)) {
            return Promise.reject(joinedKey);
        }
        return Promise.resolve(this._mergedData.get(joinedKey));
    };
    InMemoryStore.prototype.getMultiple = function (keyOrKeys) {
        var _this = this;
        var joinedKeys = lodash_1.attempt(function () {
            return ObjectStoreProviderUtils_1.formListOfSerializedKeys(keyOrKeys, _this._storeSchema.primaryKeyPath);
        });
        if (lodash_1.isError(joinedKeys)) {
            return Promise.reject(joinedKeys);
        }
        return Promise.resolve(lodash_1.compact(lodash_1.map(joinedKeys, function (key) { return _this._mergedData.get(key); })));
    };
    InMemoryStore.prototype.put = function (itemOrItems) {
        var _this = this;
        if (!this._trans.internal_isOpen()) {
            return Promise.reject("InMemoryTransaction already closed");
        }
        var err = lodash_1.attempt(function () {
            lodash_1.each(ObjectStoreProviderUtils_1.arrayify(itemOrItems), function (item) {
                var e_1, _a;
                var pk = ObjectStoreProviderUtils_1.getSerializedKeyForKeypath(item, _this._storeSchema.primaryKeyPath);
                var existingItem = _this._mergedData.get(pk);
                if (existingItem) {
                    // We're going to overwrite the PK anyways - don't remove PK
                    _this._removeFromIndices(pk, existingItem, 
                    /** RemovePrimaryKey */ false);
                }
                _this._mergedData.set(pk, item);
                _this.openPrimaryKey().put(item);
                if (_this._storeSchema.indexes) {
                    try {
                        for (var _b = __values(_this._storeSchema.indexes), _c = _b.next(); !_c.done; _c = _b.next()) {
                            var index = _c.value;
                            _this.openIndex(index.name).put(item);
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                }
            });
        });
        if (err) {
            return Promise.reject(err);
        }
        return Promise.resolve(void 0);
    };
    InMemoryStore.prototype.remove = function (keyOrKeys) {
        var _this = this;
        if (!this._trans.internal_isOpen()) {
            return Promise.reject("InMemoryTransaction already closed");
        }
        var joinedKeys = lodash_1.attempt(function () {
            return ObjectStoreProviderUtils_1.formListOfSerializedKeys(keyOrKeys, _this._storeSchema.primaryKeyPath);
        });
        if (lodash_1.isError(joinedKeys)) {
            return Promise.reject(joinedKeys);
        }
        return this._removeInternal(joinedKeys);
    };
    InMemoryStore.prototype.removeRange = function (indexName, keyLowRange, keyHighRange, lowRangeExclusive, highRangeExclusive) {
        var _this = this;
        if (!this._trans.internal_isOpen()) {
            return Promise.reject("InMemoryTransaction already closed");
        }
        var index = lodash_1.attempt(function () {
            return indexName ? _this.openIndex(indexName) : _this.openPrimaryKey();
        });
        if (!index || lodash_1.isError(index)) {
            return Promise.reject('Index "' + indexName + '" not found');
        }
        return index
            .getKeysForRange(keyLowRange, keyHighRange, lowRangeExclusive, highRangeExclusive)
            .then(function (keys) {
            return _this._removeInternal(keys);
        });
    };
    InMemoryStore.prototype.openPrimaryKey = function () {
        if (!this._indices.get("pk")) {
            this._indices.set("pk", new InMemoryIndex(this._mergedData, undefined, this._storeSchema.primaryKeyPath));
        }
        var index = this._indices.get("pk");
        index.internal_SetTransaction(this._trans);
        return index;
    };
    InMemoryStore.prototype.openIndex = function (indexName) {
        var indexSchema = lodash_1.find(this._storeSchema.indexes, function (idx) { return idx.name === indexName; });
        if (!indexSchema) {
            throw new Error("Index not found: " + indexName);
        }
        if (!this._indices.has(indexSchema.name)) {
            this._indices.set(indexSchema.name, new InMemoryIndex(this._mergedData, indexSchema, this._storeSchema.primaryKeyPath));
        }
        var index = this._indices.get(indexSchema.name);
        index.internal_SetTransaction(this._trans);
        return index;
    };
    InMemoryStore.prototype.clearAllData = function () {
        var _this = this;
        if (!this._trans.internal_isOpen()) {
            return Promise.reject("InMemoryTransaction already closed");
        }
        this._mergedData = new Map();
        lodash_1.each(this._storeSchema.indexes, function (index) {
            _this._indices.set(index.name, new InMemoryIndex(_this._mergedData, index, _this._storeSchema.primaryKeyPath));
        });
        return Promise.resolve(void 0);
    };
    InMemoryStore.prototype._removeInternal = function (keys) {
        var _this = this;
        if (!this._trans.internal_isOpen()) {
            return Promise.reject("InMemoryTransaction already closed");
        }
        lodash_1.each(keys, function (key) {
            var existingItem = _this._mergedData.get(key);
            _this._mergedData.delete(key);
            if (existingItem) {
                _this._removeFromIndices(key, existingItem, /* RemovePK */ true);
            }
        });
        return Promise.resolve(void 0);
    };
    InMemoryStore.prototype._removeFromIndices = function (key, item, removePrimaryKey) {
        var _this = this;
        // Don't need to remove from primary key on Puts because set is enough
        // 1. If it's an existing key then it will get overwritten
        // 2. If it's a new key then we need to add it
        if (removePrimaryKey) {
            this.openPrimaryKey().remove(key);
        }
        lodash_1.each(this._storeSchema.indexes, function (index) {
            var ind = _this.openIndex(index.name);
            var indexKeys = ind.internal_getKeysFromItem(item);
            // when it's a unique index, value is the item.
            // in case of a non-unique index, value is an array of items,
            // and we want to only remove items that have the same primary key
            if (ind.isUniqueIndex()) {
                lodash_1.each(indexKeys, function (indexKey) { return ind.remove(indexKey); });
            }
            else {
                lodash_1.each(indexKeys, function (idxKey) {
                    return ind.remove({ idxKey: idxKey, primaryKey: key });
                });
            }
        });
    };
    return InMemoryStore;
}());
// Note: Currently maintains nothing interesting -- rebuilds the results every time from scratch.  Scales like crap.
var InMemoryIndex = /** @class */ (function (_super) {
    __extends(InMemoryIndex, _super);
    function InMemoryIndex(_mergedData, indexSchema, primaryKeyPath) {
        var _this = _super.call(this, indexSchema, primaryKeyPath) || this;
        _this._bTreeIndex = new sorted_btree_1.default();
        _this.put(lodash_1.values(_mergedData), true);
        return _this;
    }
    InMemoryIndex.prototype.internal_SetTransaction = function (trans) {
        this._trans = trans;
    };
    InMemoryIndex.prototype.internal_getKeysFromItem = function (item) {
        var _this = this;
        var keys;
        if (this._indexSchema && this._indexSchema.fullText) {
            keys = lodash_1.map(FullTextSearchHelpers_1.getFullTextIndexWordsForItem(this._keyPath, item), function (val) { return ObjectStoreProviderUtils_1.serializeKeyToString(val, _this._keyPath); });
        }
        else if (this._indexSchema && this._indexSchema.multiEntry) {
            // Have to extract the multiple entries into this alternate table...
            var valsRaw = ObjectStoreProviderUtils_1.getValueForSingleKeypath(item, this._keyPath);
            if (valsRaw) {
                keys = lodash_1.map(ObjectStoreProviderUtils_1.arrayify(valsRaw), function (val) {
                    return ObjectStoreProviderUtils_1.serializeKeyToString(val, _this._keyPath);
                });
            }
        }
        else {
            keys = [ObjectStoreProviderUtils_1.getSerializedKeyForKeypath(item, this._keyPath)];
        }
        return keys;
    };
    // Warning: This function can throw, make sure to trap.
    InMemoryIndex.prototype.put = function (itemOrItems, skipTransactionOnCreation) {
        var _this = this;
        if (!skipTransactionOnCreation && !this._trans.internal_isOpen()) {
            throw new Error("InMemoryTransaction already closed");
        }
        var items = ObjectStoreProviderUtils_1.arrayify(itemOrItems);
        // If it's not the PK index, re-pivot the data to be keyed off the key value built from the keypath
        lodash_1.each(items, function (item) {
            // Each item may be non-unique so store as an array of items for each key
            var keys = _this.internal_getKeysFromItem(item);
            lodash_1.each(keys, function (key) {
                // For non-unique indexes we want to overwrite
                if (!_this.isUniqueIndex() && _this._bTreeIndex.has(key)) {
                    var existingItems = _this._bTreeIndex.get(key);
                    existingItems.push(item);
                    _this._bTreeIndex.set(key, existingItems);
                }
                else {
                    _this._bTreeIndex.set(key, [item]);
                }
            });
        });
    };
    InMemoryIndex.prototype.isUniqueIndex = function () {
        // An index is unique if it's the primary key (undefined index schema)
        // Or the index has defined itself as unique
        return (this._indexSchema === undefined ||
            (this._indexSchema && this._indexSchema.unique === true));
    };
    InMemoryIndex.prototype.getMultiple = function (keyOrKeys) {
        var e_2, _a;
        var _this = this;
        var joinedKeys = lodash_1.attempt(function () {
            return ObjectStoreProviderUtils_1.formListOfSerializedKeys(keyOrKeys, _this._keyPath);
        });
        if (lodash_1.isError(joinedKeys)) {
            return Promise.reject(joinedKeys);
        }
        var values = [];
        try {
            for (var joinedKeys_1 = __values(joinedKeys), joinedKeys_1_1 = joinedKeys_1.next(); !joinedKeys_1_1.done; joinedKeys_1_1 = joinedKeys_1.next()) {
                var key = joinedKeys_1_1.value;
                values.push(this._bTreeIndex.get(key));
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (joinedKeys_1_1 && !joinedKeys_1_1.done && (_a = joinedKeys_1.return)) _a.call(joinedKeys_1);
            }
            finally { if (e_2) throw e_2.error; }
        }
        return Promise.resolve(lodash_1.compact(lodash_1.flatten(values)));
    };
    InMemoryIndex.prototype.remove = function (key, skipTransactionOnCreation) {
        var _this = this;
        if (!skipTransactionOnCreation && !this._trans.internal_isOpen()) {
            throw new Error("InMemoryTransaction already closed");
        }
        if (typeof key === "string") {
            this._bTreeIndex.delete(key);
        }
        else {
            var idxItems = this._bTreeIndex.get(key.idxKey);
            if (!idxItems) {
                return;
            }
            var idxItemsWithoutItem = idxItems.filter(function (idxItem) {
                var idxItemPrimaryKeyVal = ObjectStoreProviderUtils_1.getSerializedKeyForKeypath(idxItem, _this._primaryKeyPath);
                return idxItemPrimaryKeyVal !== key.primaryKey;
            });
            // removed all items? remove the index tree node
            // otherwise, update the index value with the new array
            // sans the primary key item
            if ((idxItemsWithoutItem === null || idxItemsWithoutItem === void 0 ? void 0 : idxItemsWithoutItem.length) === 0) {
                this._bTreeIndex.delete(key.idxKey);
            }
            else {
                this._bTreeIndex.set(key.idxKey, idxItemsWithoutItem);
            }
        }
    };
    InMemoryIndex.prototype.getAll = function (reverseOrSortOrder, limit, offset) {
        var e_3, _a;
        var definedLimit = limit
            ? limit
            : this.isUniqueIndex()
                ? this._bTreeIndex._size
                : ObjectStoreProviderUtils_1.MAX_COUNT;
        var definedOffset = offset ? offset : 0;
        var data = new Array(definedLimit);
        var reverse = reverseOrSortOrder === true ||
            reverseOrSortOrder === ObjectStoreProvider_1.QuerySortOrder.Reverse;
        // when index is not unique, we cannot use offset as a starting index
        var skip = this.isUniqueIndex() ? definedOffset : 0;
        var iterator = reverse
            ? this._bTreeIndex.entriesReversed()
            : this._bTreeIndex.entries();
        var i = 0;
        try {
            for (var iterator_1 = __values(iterator), iterator_1_1 = iterator_1.next(); !iterator_1_1.done; iterator_1_1 = iterator_1.next()) {
                var item = iterator_1_1.value;
                if (skip > 0) {
                    skip--;
                    continue;
                }
                // when index is not unique, each node may contain multiple items
                if (!this.isUniqueIndex()) {
                    var count = item[1].length;
                    var minOffsetCount = Math.min(count, definedOffset);
                    count -= minOffsetCount;
                    definedOffset -= minOffsetCount;
                    // we have skipped all values in this index, go to the next one
                    if (count === 0) {
                        continue;
                    }
                    var values_1 = this._getKeyValues(item[0], definedLimit - i, item[1].length - count, reverse);
                    values_1.forEach(function (v, j) {
                        data[i + j] = v;
                    });
                    i += values_1.length;
                }
                else {
                    data[i] = item[1][0];
                    i++;
                }
                if (i >= definedLimit) {
                    break;
                }
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (iterator_1_1 && !iterator_1_1.done && (_a = iterator_1.return)) _a.call(iterator_1);
            }
            finally { if (e_3) throw e_3.error; }
        }
        // if index is not unique, trim the empty slots in data
        // if we used MAX_COUNT to construct it.
        if (!this.isUniqueIndex() && i !== definedLimit) {
            return Promise.resolve(ObjectStoreProviderUtils_1.trimArray(data, i));
        }
        else {
            return Promise.resolve(data);
        }
    };
    InMemoryIndex.prototype.getOnly = function (key, reverseOrSortOrder, limit, offset) {
        return this.getRange(key, key, false, false, reverseOrSortOrder, limit, offset);
    };
    InMemoryIndex.prototype.getRange = function (keyLowRange, keyHighRange, lowRangeExclusive, highRangeExclusive, reverseOrSortOrder, limit, offset) {
        var _this = this;
        var values = lodash_1.attempt(function () {
            var e_4, _a;
            var reverse = reverseOrSortOrder === true ||
                reverseOrSortOrder === ObjectStoreProvider_1.QuerySortOrder.Reverse;
            limit = limit
                ? limit
                : _this.isUniqueIndex()
                    ? _this._bTreeIndex._size
                    : ObjectStoreProviderUtils_1.MAX_COUNT;
            offset = offset ? offset : 0;
            var keyLow = ObjectStoreProviderUtils_1.serializeKeyToString(keyLowRange, _this._keyPath);
            var keyHigh = ObjectStoreProviderUtils_1.serializeKeyToString(keyHighRange, _this._keyPath);
            var iterator = reverse
                ? _this._bTreeIndex.entriesReversed()
                : _this._bTreeIndex.entries();
            var values = [];
            try {
                for (var iterator_2 = __values(iterator), iterator_2_1 = iterator_2.next(); !iterator_2_1.done; iterator_2_1 = iterator_2.next()) {
                    var entry = iterator_2_1.value;
                    var key = entry[0];
                    if ((key > keyLow || (key === keyLow && !lowRangeExclusive)) &&
                        (key < keyHigh || (key === keyHigh && !highRangeExclusive))) {
                        if (offset > 0) {
                            if (_this.isUniqueIndex()) {
                                offset--;
                                continue;
                            }
                            else {
                                var idxValues = _this._bTreeIndex.get(key);
                                offset -= idxValues.length;
                                // if offset >= 0, we skipped just enough, or we still need to skip more
                                // if offset < 0, we need to get some of the values from the index
                                if (offset >= 0) {
                                    continue;
                                }
                            }
                        }
                        if (values.length >= limit) {
                            break;
                        }
                        if (_this.isUniqueIndex()) {
                            values = values.concat(_this._bTreeIndex.get(key));
                        }
                        else {
                            values = values.concat(_this._getKeyValues(key, limit - values.length, Math.abs(offset), reverse));
                            if (offset < 0) {
                                offset = 0;
                            }
                        }
                    }
                }
            }
            catch (e_4_1) { e_4 = { error: e_4_1 }; }
            finally {
                try {
                    if (iterator_2_1 && !iterator_2_1.done && (_a = iterator_2.return)) _a.call(iterator_2);
                }
                finally { if (e_4) throw e_4.error; }
            }
            return values;
        });
        if (lodash_1.isError(values)) {
            return Promise.reject(values);
        }
        return Promise.resolve(values);
    };
    InMemoryIndex.prototype.getKeysForRange = function (keyLowRange, keyHighRange, lowRangeExclusive, highRangeExclusive) {
        var _this = this;
        var keys = lodash_1.attempt(function () {
            return _this._getKeysForRange(keyLowRange, keyHighRange, lowRangeExclusive, highRangeExclusive);
        });
        if (lodash_1.isError(keys)) {
            return Promise.reject(void 0);
        }
        return Promise.resolve(keys);
    };
    /**
     * Utility function to simplify offset/limit checks and allow a negative offset. Retrieves values associated with the given key
     * @param key primary key
     * @param limit
     * @param offset can be neagtive, treated the same way as 0
     * @param reverse
     * @returns value associated with given key, undefined if the key is not found.
     */
    InMemoryIndex.prototype._getKeyValues = function (key, limit, offset, reverse) {
        if (limit <= 0) {
            return [];
        }
        var idxValues = this._bTreeIndex.get(key);
        // get may return undefined, if the key is not found
        if (!idxValues) {
            return idxValues;
        }
        if (offset >= idxValues.length) {
            return [];
        }
        // Perf optimisation. No items to skip, and limit is at least the number of items we have in the index.
        // we know that we will need the whole index values array to fulfill the results,
        // skip using take/drop, return the whole array immediately.
        if (offset <= 0 && limit >= idxValues.length) {
            return reverse ? idxValues.slice().reverse() : idxValues;
        }
        var itemsToDrop = Math.min(limit, offset);
        var itemsToTake = Math.min(limit, idxValues.length - offset);
        return reverse
            ? lodash_1.takeRight(lodash_1.dropRight(idxValues, itemsToDrop), itemsToTake)
            : lodash_1.take(lodash_1.drop(idxValues, itemsToDrop), itemsToTake);
    };
    // Warning: This function can throw, make sure to trap.
    InMemoryIndex.prototype._getKeysForRange = function (keyLowRange, keyHighRange, lowRangeExclusive, highRangeExclusive) {
        var e_5, _a;
        var keyLow = ObjectStoreProviderUtils_1.serializeKeyToString(keyLowRange, this._keyPath);
        var keyHigh = ObjectStoreProviderUtils_1.serializeKeyToString(keyHighRange, this._keyPath);
        var iterator = this._bTreeIndex.entries();
        var keys = [];
        try {
            for (var iterator_3 = __values(iterator), iterator_3_1 = iterator_3.next(); !iterator_3_1.done; iterator_3_1 = iterator_3.next()) {
                var entry = iterator_3_1.value;
                var key = entry[0];
                if ((key > keyLow || (key === keyLow && !lowRangeExclusive)) &&
                    (key < keyHigh || (key === keyHigh && !highRangeExclusive))) {
                    keys.push(key);
                }
            }
        }
        catch (e_5_1) { e_5 = { error: e_5_1 }; }
        finally {
            try {
                if (iterator_3_1 && !iterator_3_1.done && (_a = iterator_3.return)) _a.call(iterator_3);
            }
            finally { if (e_5) throw e_5.error; }
        }
        return keys;
    };
    // Warning: This function can throw, make sure to trap.
    InMemoryIndex.prototype._getKeyCountForRange = function (keyLowRange, keyHighRange, lowRangeExclusive, highRangeExclusive) {
        var e_6, _a;
        var keyLow = ObjectStoreProviderUtils_1.serializeKeyToString(keyLowRange, this._keyPath);
        var keyHigh = ObjectStoreProviderUtils_1.serializeKeyToString(keyHighRange, this._keyPath);
        var iterator = this._bTreeIndex.entries();
        var keyCount = 0;
        try {
            for (var iterator_4 = __values(iterator), iterator_4_1 = iterator_4.next(); !iterator_4_1.done; iterator_4_1 = iterator_4.next()) {
                var item = iterator_4_1.value;
                if ((item[0] > keyLow || (item[0] === keyLow && !lowRangeExclusive)) &&
                    (item[0] < keyHigh || (item[0] === keyHigh && !highRangeExclusive))) {
                    if (this.isUniqueIndex()) {
                        keyCount++;
                    }
                    else {
                        keyCount += item[1].length;
                    }
                }
            }
        }
        catch (e_6_1) { e_6 = { error: e_6_1 }; }
        finally {
            try {
                if (iterator_4_1 && !iterator_4_1.done && (_a = iterator_4.return)) _a.call(iterator_4);
            }
            finally { if (e_6) throw e_6.error; }
        }
        return keyCount;
    };
    InMemoryIndex.prototype.countAll = function () {
        var _this = this;
        if (this.isUniqueIndex()) {
            return Promise.resolve(this._bTreeIndex._size);
        }
        else {
            var keyCount = lodash_1.attempt(function () {
                var e_7, _a;
                var iterator = _this._bTreeIndex.entries();
                var keyCount = 0;
                try {
                    for (var iterator_5 = __values(iterator), iterator_5_1 = iterator_5.next(); !iterator_5_1.done; iterator_5_1 = iterator_5.next()) {
                        var item = iterator_5_1.value;
                        keyCount += item[1].length;
                    }
                }
                catch (e_7_1) { e_7 = { error: e_7_1 }; }
                finally {
                    try {
                        if (iterator_5_1 && !iterator_5_1.done && (_a = iterator_5.return)) _a.call(iterator_5);
                    }
                    finally { if (e_7) throw e_7.error; }
                }
                return keyCount;
            });
            if (lodash_1.isError(keyCount)) {
                return Promise.reject(keyCount);
            }
            return Promise.resolve(keyCount);
        }
    };
    InMemoryIndex.prototype.countOnly = function (key) {
        return this.countRange(key, key, false, false);
    };
    InMemoryIndex.prototype.countRange = function (keyLowRange, keyHighRange, lowRangeExclusive, highRangeExclusive) {
        var _this = this;
        if (this.isUniqueIndex()) {
            var keys = lodash_1.attempt(function () {
                return _this._getKeysForRange(keyLowRange, keyHighRange, lowRangeExclusive, highRangeExclusive);
            });
            if (lodash_1.isError(keys)) {
                return Promise.reject(keys);
            }
            return Promise.resolve(keys.length);
        }
        else {
            var keyCount = lodash_1.attempt(function () {
                return _this._getKeyCountForRange(keyLowRange, keyHighRange, lowRangeExclusive, highRangeExclusive);
            });
            if (lodash_1.isError(keyCount)) {
                return Promise.reject(keyCount);
            }
            return Promise.resolve(keyCount);
        }
    };
    return InMemoryIndex;
}(FullTextSearchHelpers_1.DbIndexFTSFromRangeQueries));
//# sourceMappingURL=InMemoryProvider.js.map