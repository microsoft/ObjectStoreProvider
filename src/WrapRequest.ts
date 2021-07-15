export function wrapAndWait(req: IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (/*ev*/) => resolve();
    req.onerror = reject;
  });
}

export function wrapArray(req: IDBRequest): Promise<any[]> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (/*ev*/) => {
      resolve(req.result);
    };
    req.onerror = reject;
  });
}

export function wrapRequest<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (/*ev*/) => {
      resolve(req.result);
    };
    req.onerror = reject;
  });
}
