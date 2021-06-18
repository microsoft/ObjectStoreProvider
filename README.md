# ObjectStoreProvider [![Build Status](https://travis-ci.org/Microsoft/ObjectStoreProvider.svg?branch=master)](https://travis-ci.org/Microsoft/ObjectStoreProvider)
We developed ObjectStoreProvider after needing a simplified interface toobject storage/retrieval that worked not only across all browsers. We also have built a fully in-memory database provider that has no persistence but supports fully transactional semantics, for a fallback in situations where you don't want persistence (ephemeral logins, etc.)

# Differences to ObjectStoreProvider
This project has some notable differences to [ObjectStoreProvider](https://github.com/microsoft/ObjectStoreProvider), and these differences are why it is a separate repo 
1. Support for removeRange apis.
2. Support for getMultiple on any index. 
3. Unlike in the case of ObjectStoreProvider, the inMemoryProvider is actually mutable. This was mainly done as we enforce immutability using typescript DeepReadonly types. Consumers should be aware of this while consuming the library. In the near future we will change to interfaces throughout the project to return readonly types. It is highly recommended that consumers add lint rules that prevent casting to <any> , <unknown> or operations like Object.assign() which will break the immutability.
4. Targets ES6, and higher ES versions for better performance
5. It uses red-black tree based indices for better performance of the inMemory provider

The rest of these changes in the library have been pushed upstream to ObjectStoreProvider as well. However, points 3, 4 & 5 are irreconcilable as it needs to be enforced across all consumers of ObjectStoreProvider. Hence this repo has been made separately. 

# Examples
None available, we will add some soon!.

# Providers/Platforms/Support

Browsers: Firefox, Safari, Edge, Chrome. 
    Execution Contexts: WebWorkers, SharedWorkers, ServiceWorkers, Browser context.

Desktop Frameworks: WebView2, Electron

Other support: NodeJS

# Usage

Coming soon.

## Compiling
### Source
```bash
npm install
npm run build
```
### Tests
```bash
npm install
npm run webtest
```

## Testing
1. Compile tests
1. Open test.html in browser
1. You can add `?grep=foo` to the URL to run only tests containing 'foo' in the name
