import { IObjectStoreProviderLogger } from "./ObjectStoreProvider";

export interface ILoggerContext {
  dbName?: string;
  storeName?: string;
  indexName?: string;
  deletedStores?: string[];
  createdStores?: string[];
  oldVersion?: number;
  newVersion?: number;
}

export class LogWriter {
  constructor(public logger: IObjectStoreProviderLogger) {}

  public log(message: string, context?: ILoggerContext) {
    const messageToWrite = this.computeMessageToWrite(message, context);
    this.logger.log(messageToWrite);
  }

  public error(message: string, context?: ILoggerContext) {
    const messageToWrite = this.computeMessageToWrite(message, context);
    this.logger.error(messageToWrite);
  }

  public warn(message: string, context?: ILoggerContext) {
    const messageToWrite = this.computeMessageToWrite(message, context);
    this.logger.warn(messageToWrite);
  }

  private computeMessageToWrite(message: string, context?: ILoggerContext) {
    let contextMessages: string[] = [];
    if (context) {
      for (const key in context) {
        const value = context[key as keyof ILoggerContext];
        if (!value) {
          continue;
        }
        contextMessages.push(`${key}: ${value}`);
      }
    }
    if (!contextMessages.length) {
      return message;
    }
    return `${message}. ${contextMessages.join(", ")}`;
  }
}
