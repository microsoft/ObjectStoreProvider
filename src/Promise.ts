// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
declare interface Promise<T> {
  finally: (onfinally?: (() => void) | null | undefined) => Promise<T>;
  always: <U>(func: (value: T | any) => U | PromiseLike<U>) => Promise<U>;
}

Promise.prototype.finally = function (onResolveOrReject) {
  return this.catch(function (reason: any) {
    return reason;
  }).then(onResolveOrReject);
};
Promise.prototype.always = function (onResolveOrReject) {
  return this.then(onResolveOrReject, function (reason: any) {
    onResolveOrReject(reason);
    throw reason;
  });
};
