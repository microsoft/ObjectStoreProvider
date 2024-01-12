import { IObjectStoreProviderLogger } from "../ObjectStoreProvider";

export class MockLogger implements TestLogger {
  loggedMessages: string[] = [];
  loggedWarnings: string[] = [];
  loggedErrors: string[] = [];

  log(message: string): void {
    this.loggedMessages.push(message);
  }
  warn(message: string): void {
    this.loggedWarnings.push(message);
  }
  error(message: string): void {
    this.loggedErrors.push(message);
  }

  hasLoggedMessageContaining(messageToSearch: string): boolean {
    return this.loggedMessages.some((log) => log.indexOf(messageToSearch) > 0);
  }

  hasLoggedWarningContaining(messageToSearch: string): boolean {
    return this.loggedWarnings.some((log) => log.indexOf(messageToSearch) > 0);
  }
  hasLoggedErrorContaining(messageToSearch: string): boolean {
    return this.loggedErrors.some((log) => log.indexOf(messageToSearch) > 0);
  }
}

export interface TestLogger extends IObjectStoreProviderLogger {
  /**
   * Returns whether messageToSearch is contained in any of the messages that were logged to logger.log
   * @param messageToSearch
   */
  hasLoggedMessageContaining(messageToSearch: string): boolean;
  /**
   * Returns whether messageToSearch is contained in any of the messages that were logged to logger.warn
   * @param messageToSearch
   */
  hasLoggedWarningContaining(messageToSearch: string): boolean;
  /**
   * Returns whether messageToSearch is contained in any of the messages that were logged to logger.error
   * @param messageToSearch
   */
  hasLoggedErrorContaining(messageToSearch: string): boolean;
}
