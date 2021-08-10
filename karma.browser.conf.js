module.exports = (config) => {
  config.set({
    // 1. Load this karma plugin
    frameworks: ["mocha"],

    files: [
      { pattern: "dist/ObjectStoreProvider.spec.js" },
      { pattern: "dist/SortedBTree.spec.js" },
    ],
    customLaunchers: {
      FirefoxHeadless: {
        base: "Firefox",
        flags: ["-headless"],
      },
    },
  });
};
