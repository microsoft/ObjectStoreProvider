import { assert } from "chai";
import { LogWriter } from "../LogWriter";

describe("LogWriter", () => {
  it("basic", () => {
    let output: any = "";
    const logger = {
      log: (message: string) => {
        output = message;
      },
      warn: (message: string) => {
        output = message;
      },
      error: (message: string) => {
        output = message;
      },
    };
    const logWriter = new LogWriter(logger);

    // log
    logWriter.log(`Message 1`);
    assert(output === `Message 1`);
    logWriter.log(`Db open`, { dbName: "settings" });
    assert(output === `Db open. dbName: settings`);
    logWriter.log(`Create store`, { dbName: "settings", storeName: "flags" });
    assert(output === `Create store. dbName: settings, storeName: flags`);
    logWriter.log(`Create store`, {
      dbName: "settings",
      storeName: "flags",
      indexName: "test",
    });
    assert(
      output ===
        `Create store. dbName: settings, storeName: flags, indexName: test`,
    );

    // warn
    logWriter.warn(`Message 1`);
    assert(output === `Message 1`);
    logWriter.warn(`Db open`, { dbName: "settings" });
    assert(output === `Db open. dbName: settings`);
    logWriter.warn(`Create store`, { dbName: "settings", storeName: "flags" });
    assert(output === `Create store. dbName: settings, storeName: flags`);
    logWriter.warn(`Create store`, {
      dbName: "settings",
      storeName: "flags",
      indexName: "test",
    });
    assert(
      output ===
        `Create store. dbName: settings, storeName: flags, indexName: test`,
    );

    // error
    logWriter.error(`Message 1`);
    assert(output === `Message 1`);
    logWriter.error(`Db open`, { dbName: "settings" });
    assert(output === `Db open. dbName: settings`);
    logWriter.error(`Create store`, { dbName: "settings", storeName: "flags" });
    assert(output === `Create store. dbName: settings, storeName: flags`);
    logWriter.error(`Create store`, {
      dbName: "settings",
      storeName: "flags",
      indexName: "test",
    });
    assert(
      output ===
        `Create store. dbName: settings, storeName: flags, indexName: test`,
    );
  });
});
