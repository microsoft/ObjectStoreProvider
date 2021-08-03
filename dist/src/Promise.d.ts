declare interface Promise<T> {
    finally: (onfinally?: (() => void) | null | undefined) => Promise<T>;
    always: <U>(func: (value: T | any) => U | PromiseLike<U>) => Promise<U>;
}
