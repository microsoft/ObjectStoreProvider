/**
 * InMemoryProvider.ts
 * Author: David de Regt
 * Copyright: Microsoft 2015
 *
 * ObjectStoreProvider provider setup for a non-persisted in-memory database backing provider.
 */
import { DbIndexFTSFromRangeQueries } from "./FullTextSearchHelpers";
import { StoreSchema, DbProvider, DbSchema, DbTransaction, IndexSchema, DbStore, QuerySortOrder, ItemType, KeyPathType, KeyType } from "./ObjectStoreProvider";
import { TransactionToken, TransactionLockHelper } from "./TransactionLockHelper";
export interface StoreData {
    data: Map<string, ItemType>;
    indices: Map<string, InMemoryIndex>;
    schema: StoreSchema;
}
export declare class InMemoryProvider extends DbProvider {
    private _stores;
    private _lockHelper;
    open(dbName: string, schema: DbSchema, wipeIfExists: boolean, verbose: boolean): Promise<void>;
    protected _deleteDatabaseInternal(): Promise<void>;
    openTransaction(storeNames: string[], writeNeeded: boolean): Promise<DbTransaction>;
    close(): Promise<void>;
    internal_getStore(name: string): StoreData;
}
declare class InMemoryTransaction implements DbTransaction {
    private _prov;
    private _lockHelper;
    private _transToken;
    private _stores;
    private _openTimer;
    constructor(_prov: InMemoryProvider, _lockHelper: TransactionLockHelper, _transToken: TransactionToken, writeNeeded: boolean);
    private _commitTransaction;
    getCompletionPromise(): Promise<void>;
    abort(): void;
    markCompleted(): void;
    getStore(storeName: string): DbStore;
    internal_isOpen(): boolean;
}
declare class InMemoryIndex extends DbIndexFTSFromRangeQueries {
    private _bTreeIndex;
    private _trans?;
    constructor(_mergedData: Map<string, ItemType>, indexSchema: IndexSchema, primaryKeyPath: KeyPathType);
    internal_SetTransaction(trans: InMemoryTransaction): void;
    internal_getKeysFromItem(item: ItemType): string[] | undefined;
    put(itemOrItems: ItemType | ItemType[], skipTransactionOnCreation?: boolean): void;
    isUniqueIndex(): boolean;
    getMultiple(keyOrKeys: KeyType | KeyType[]): Promise<ItemType[]>;
    remove(key: string | {
        primaryKey: string;
        idxKey: string;
    }, skipTransactionOnCreation?: boolean): void;
    getAll(reverseOrSortOrder?: boolean | QuerySortOrder, limit?: number, offset?: number): Promise<ItemType[]>;
    getOnly(key: KeyType, reverseOrSortOrder?: boolean | QuerySortOrder, limit?: number, offset?: number): Promise<ItemType[]>;
    getRange(keyLowRange: KeyType, keyHighRange: KeyType, lowRangeExclusive?: boolean, highRangeExclusive?: boolean, reverseOrSortOrder?: boolean | QuerySortOrder, limit?: number, offset?: number): Promise<ItemType[]>;
    getKeysForRange(keyLowRange: KeyType, keyHighRange: KeyType, lowRangeExclusive?: boolean, highRangeExclusive?: boolean): Promise<any[]>;
    /**
     * Utility function to simplify offset/limit checks and allow a negative offset. Retrieves values associated with the given key
     * @param key primary key
     * @param limit
     * @param offset can be neagtive, treated the same way as 0
     * @param reverse
     * @returns value associated with given key, undefined if the key is not found.
     */
    private _getKeyValues;
    private _getKeysForRange;
    private _getKeyCountForRange;
    countAll(): Promise<number>;
    countOnly(key: KeyType): Promise<number>;
    countRange(keyLowRange: KeyType, keyHighRange: KeyType, lowRangeExclusive?: boolean, highRangeExclusive?: boolean): Promise<number>;
}
export {};
