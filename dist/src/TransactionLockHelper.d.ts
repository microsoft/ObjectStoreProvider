import { DbSchema } from "./ObjectStoreProvider";
export interface TransactionToken {
    readonly completionPromise: Promise<void>;
    readonly storeNames: string[];
    readonly exclusive: boolean;
}
export declare class Deferred<T> {
    private _promise;
    private _reject;
    private _resolve;
    constructor();
    get promise(): Promise<T>;
    resolve(value: T | PromiseLike<T> | undefined): void;
    reject(reason?: any): void;
}
export declare class TransactionLockHelper {
    private _schema;
    private _supportsDiscreteTransactions;
    private _closingDefer;
    private _closed;
    private _exclusiveLocks;
    private _readOnlyCounts;
    private _pendingTransactions;
    constructor(_schema: DbSchema, _supportsDiscreteTransactions: boolean);
    closeWhenPossible(): Promise<void>;
    private _checkClose;
    hasTransaction(): boolean;
    openTransaction(storeNames: string[] | undefined, exclusive: boolean): Promise<TransactionToken>;
    transactionComplete(token: TransactionToken): void;
    transactionFailed(token: TransactionToken, message: string): void;
    private _cleanTransaction;
    private _checkNextTransactions;
}
