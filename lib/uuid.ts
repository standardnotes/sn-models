import { isNullOrUndefined } from '@Lib/utils';

/**
 * An abstract class with no instance methods. Used globally to generate uuids by any
 * consumer. Application must call SetGenerators before use.
 */
export class Uuid {
  private static syncUuidFunc?: () => string
  private static asyncUuidFunc: () => Promise<string>

  /**
   * Dynamically feed both a syncronous and asyncronous implementation of a UUID generator function.
   * Feeding it this way allows platforms to implement their own uuid generation schemes, without
   * this class having to import any global functions.
   * @param {function} asyncImpl - An asyncronous function that returns a UUID.
   * @param {function} syncImpl - A syncronous function that returns a UUID.
   */
  static SetGenerators(
    asyncImpl: () => Promise<string>,
    syncImpl?: () => string
  ) {
    this.syncUuidFunc = syncImpl;
    this.asyncUuidFunc = asyncImpl;
  }

  /**
   * Whether there is a syncronous UUID generation function available.
   */
  public static canGenSync() {
    return !isNullOrUndefined(this.syncUuidFunc);
  }

  /**
   * Generates a UUID string asyncronously.
   */
  public static async GenerateUuid() {
    if (this.syncUuidFunc) {
      return this.syncUuidFunc();
    } else {
      return this.asyncUuidFunc();
    }
  }

  /**
   * Generates a UUID string syncronously.
   */
  public static GenerateUuidSynchronously() {
    return this.syncUuidFunc!();
  }
}