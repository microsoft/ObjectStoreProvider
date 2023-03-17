// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// this is a module with side-effects that add polyfills for finally and always
// methods of the Promise

declare interface Promise<T> {
  finally: (onfinally?: (() => void) | null | undefined) => Promise<T>;
  always: <U>(func: (value: T | any) => U | PromiseLike<U>) => Promise<U>;
}

// polyfill for Promise.finally. It is part of ES6 spec now, but was not in it originally and has spotty support in older browsers:
// https://caniuse.com/mdn-javascript_builtins_promise_finally

if (typeof(Promise.prototype.finally) !== "function") {
  Promise.prototype.finally = function (onResolveOrReject) {
    const hasFunctionCallback = typeof(onResolveOrReject) === "function";
    return this.catch(function (reason: any) {
      hasFunctionCallback && onResolveOrReject();
      return Promise.reject(reason);  
    }).then(function (result: any) {
      hasFunctionCallback && onResolveOrReject();
      return result;
    });
  };
}

// always polyfill, not part of the ES spec
if (typeof(Promise.prototype.always) !== "function") {
  Promise.prototype.always = function (onResolveOrReject) {
    return this.then(onResolveOrReject, function (reason: any) {
      onResolveOrReject(reason);
      throw reason;
    });
  };
}
