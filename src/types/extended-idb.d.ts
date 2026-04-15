export {};

// Chromium extension: dataLoss/dataLossMessage on IDBVersionChangeEvent
// See https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/modules/indexeddb/idb_version_change_event.idl
declare global {
  interface IDBVersionChangeEvent {
    /** Non-standard Chromium extension. Indicates whether data was lost during upgrade. */
    readonly dataLoss?: "none" | "total";
    /** Non-standard Chromium extension. Message describing the data loss. */
    readonly dataLossMessage?: string;
  }
}

export type IDBGetAllRecordsOptions = {
  // The maximum number of records to retrieve.
  count: number;

  // The direction of the cursor when retrieving records.
  // "next" for ascending order, "prev" for descending order.
  direction: "next" | "prev";

  query: IDBKeyRange | null;
};

// Response of new getAllRecords method.
type IDBRecord = {
  key: any;
  primaryKey: any;
  value: any;
};

// Extending interfaces with new methods, which are not in typeScript library yet.
// More details can be found in https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/IndexedDbGetAllEntries/explainer.md
declare global {
  interface IDBIndex {
    /**
     * Retrieves all records in the index.
     * This is an experimental new API and may not be available in all environments.
     */
    getAllRecords?: (
      options?: IDBGetAllRecordsOptions
    ) => IDBRequest<IDBRecord[]>;
  }

  interface IDBObjectStore {
    /**
     * Retrieves all records in the index
     * This is an experimental new API and may not be available in all environments.
     */
    getAllRecords?: (
      options?: IDBGetAllRecordsOptions
    ) => IDBRequest<IDBRecord[]>;
  }
}
