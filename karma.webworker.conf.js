module.exports = (config) => {
  config.set({
    // 1. Load this karma plugin
    frameworks: ["mocha-webworker"],

    // 2. Configure the files you would like karma to serve.
    //    Make sure you set `included` to `false`. Otherwise karma
    //    will execute your scripts outside of the WebWorker.
    files: [{ pattern: "dist/ObjectStoreProvider.spec.js", included: false }],
    customLaunchers: {
      FirefoxHeadless: {
        base: "Firefox",
        flags: ["-headless"],
      },
    },
    client: {
      mochaWebWorker: {
        pattern: ["dist/ObjectStoreProvider.spec.js"],
        // You can also use a SharedWorker for test execution
        // instead of the default 'Worker'
        worker: "Worker",
        // You can also pass some options to mocha:
        mocha: {},
        // You can also evaluate javascript code within the Worker at various stages:
        evaluate: {
          beforeMochaImport:
            'self.console.log("Before the mocha script is imported")',
          beforeMochaSetup:
            'self.console.log("Before mocha is setup (mocha.setup())")',
          beforeScripts: 'self.console.log("Before your scripts are imported")',
          beforeRun:
            'self.console.log("Before your tests are run (mocha.run())")',
          afterRun: 'self.console.log("After your tests have been run")',
        },
      },
    },
  });
};
