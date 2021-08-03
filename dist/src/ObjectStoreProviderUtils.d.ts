/**
 * ObjectStoreProviderUtils.ts
 * Author: David de Regt
 * Copyright: Microsoft 2015
 *
 * Reusable helper functions for ObjectStoreProvider providers/transactions/etc.
 */
import { KeyComponentType, KeyPathType, KeyType } from "./ObjectStoreProvider";
declare global {
    interface Document {
        documentMode: number;
    }
}
export declare const MAX_COUNT = 4294967295;
export declare function isIE(): boolean;
export declare function isSafari(): boolean;
export declare function arrayify<T>(obj: T | T[]): T[];
export declare function trimArray<TValue>(array: Array<TValue>, trimLength: number): Array<TValue>;
export declare function getSerializedKeyForKeypath(obj: any, keyPathRaw: KeyPathType): string | undefined;
export declare function getKeyForKeypath(obj: any, keyPathRaw: KeyPathType): KeyType | undefined;
export declare function getValueForSingleKeypath(obj: any, singleKeyPath: string): any;
export declare function isCompoundKeyPath(keyPath: KeyPathType): boolean;
export declare function formListOfKeys(keyOrKeys: KeyType | KeyType[], keyPath: KeyPathType): any[];
export declare function serializeValueToOrderableString(val: KeyComponentType): string;
export declare function serializeNumberToOrderableString(n: number): string;
export declare function serializeKeyToString(key: KeyType, keyPath: KeyPathType): string;
export declare function formListOfSerializedKeys(keyOrKeys: KeyType | KeyType[], keyPath: KeyPathType): string[];
