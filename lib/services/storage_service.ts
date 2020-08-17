import { RawStorageKey, namespacedKey } from '@Lib/storage_keys';
import { ApplicationStage } from '@Lib/stages';
import { PayloadContent, CreateMaxPayloadFromAnyObject } from '@Payloads/generator';
import { EncryptionDelegate } from './encryption_delegate';
import { EncryptionIntent } from '@Protocol/intents';
import { SNRootKey } from '@Protocol/root_key';
import { PurePayload } from '@Payloads/pure_payload';
import { PureService } from '@Lib/services/pure_service';
import { ContentType } from '@Models/content_types';
import { isNullOrUndefined, Copy } from '@Lib/utils';
import { Uuid } from '@Lib/uuid';
import { DeviceInterface } from '../device_interface';

export enum StoragePersistencePolicies {
  Default = 1,
  Ephemeral = 2
};

export enum StorageEncryptionPolicies {
  Default = 1,
  Disabled = 2,
};

export enum StorageValueModes {
  /** Stored inside wrapped encrpyed storage object */
  Default = 1,
  /** Stored outside storage object, unencrypted */
  Nonwrapped = 2
};

export enum ValueModesKeys {
  /* Is encrypted */
  Wrapped = 'wrapped',
  /* Is decrypted */
  Unwrapped = 'unwrapped',
  /* Lives outside of wrapped/unwrapped */
  Nonwrapped = 'nonwrapped',
};
type ValuesObjectRecord = Record<string, any>

export type StorageValuesObject = {
  [ValueModesKeys.Wrapped]: ValuesObjectRecord
  [ValueModesKeys.Unwrapped]?: ValuesObjectRecord
  [ValueModesKeys.Nonwrapped]: ValuesObjectRecord
}

type PayloadEncryptionFunction = (payload: PurePayload, intent: EncryptionIntent) => Promise<PurePayload>

/**
 * The storage service is responsible for persistence of both simple key-values, and payload
 * storage. It does so by relying on deviceInterface to save and retrieve raw values and payloads.
 * For simple key/values, items are grouped together in an in-memory hash, and persisted to disk
 * as a single object (encrypted, when possible). It handles persisting payloads in the local
 * database by encrypting the payloads when possible.
 * The storage service also exposes methods that allow the application to initially
 * decrypt the persisted key/values, and also a method to determine whether a particular
 * key can decrypt wrapped storage.
 */
export class SNStorageService extends PureService {

  public encryptionDelegate?: EncryptionDelegate
  private namespace: string
  /** Wait until application has been unlocked before trying to persist */
  private storagePersistable = false
  private persistencePolicy!: StoragePersistencePolicies
  private encryptionPolicy!: StorageEncryptionPolicies

  private values!: StorageValuesObject

  constructor(
    deviceInterface: DeviceInterface,
    namespace: string
  ) {
    super();
    this.deviceInterface = deviceInterface;
    this.namespace = namespace;
    this.setPersistencePolicy(StoragePersistencePolicies.Default);
    this.setEncryptionPolicy(StorageEncryptionPolicies.Default);
  }

  public deinit() {
    this.deviceInterface = undefined;
    this.encryptionDelegate = undefined;
    super.deinit();
  }

  async handleApplicationStage(stage: ApplicationStage) {
    await super.handleApplicationStage(stage);
    if (stage === ApplicationStage.Launched_10) {
      this.storagePersistable = true;
    }
  }

  public async setPersistencePolicy(persistencePolicy: StoragePersistencePolicies) {
    this.persistencePolicy = persistencePolicy;
    if (this.persistencePolicy === StoragePersistencePolicies.Ephemeral) {
      await this.deviceInterface!.removeAllRawStorageValues();
      await this.clearAllPayloads();
    }
  }

  public async setEncryptionPolicy(encryptionPolicy: StorageEncryptionPolicies) {
    this.encryptionPolicy = encryptionPolicy;
  }

  public isEphemeralSession() {
    return this.persistencePolicy === StoragePersistencePolicies.Ephemeral;
  }

  public async initializeFromDisk() {
    const value = await this.deviceInterface!.getRawStorageValue(
      this.getPersistenceKey()
    );
    const values = value ? JSON.parse(value) : undefined;
    this.setInitialValues(values);
  }

  /**
   * Called by platforms with the value they load from disk,
   * after they handle initializeFromDisk
   */
  private setInitialValues(values?: StorageValuesObject) {
    if (!values) {
      values = this.defaultValuesObject();
    }
    if (!values![ValueModesKeys.Unwrapped]) {
      values![ValueModesKeys.Unwrapped] = {};
    }
    this.values = values!;
  }

  public isStorageWrapped() {
    const wrappedValue = this.values[ValueModesKeys.Wrapped];
    return !isNullOrUndefined(wrappedValue) && Object.keys(wrappedValue).length > 0;
  }

  public async canDecryptWithKey(key: SNRootKey) {
    const wrappedValue = this.values[ValueModesKeys.Wrapped];
    const decryptedPayload = await this.decryptWrappedValue(
      wrappedValue,
      key,
    );
    return !decryptedPayload.errorDecrypting;
  }

  private async decryptWrappedValue(wrappedValue: any, key?: SNRootKey) {
    /**
    * The read content type doesn't matter, so long as we know it responds
    * to content type. This allows a more seamless transition when both web
    * and mobile used different content types for encrypted storage.
    */
    if (!(wrappedValue?.content_type)) {
      throw Error('Attempting to decrypt nonexistent wrapped value');
    }

    const payload = CreateMaxPayloadFromAnyObject(
      wrappedValue,
      {
        content_type: ContentType.EncryptedStorage
      }
    );

    const decryptedPayload = await this.encryptionDelegate!.payloadByDecryptingPayload(
      payload,
      key
    );
    return decryptedPayload;
  }

  public async decryptStorage() {
    const wrappedValue = this.values[ValueModesKeys.Wrapped];
    const decryptedPayload = await this.decryptWrappedValue(wrappedValue);
    if (decryptedPayload.errorDecrypting) {
      throw Error('Unable to decrypt storage.');
    }
    this.values[ValueModesKeys.Unwrapped] = Copy(decryptedPayload.contentObject);
  }

  /** @todo This function should be debounced. */
  private async persistValuesToDisk() {
    if (!this.storagePersistable) {
      return;
    }
    if (this.persistencePolicy === StoragePersistencePolicies.Ephemeral) {
      return;
    }
    const values = await this.immediatelyPersistValuesToDisk();
    /** Save the persisted value so we have access to it in memory (for unit tests afawk) */
    this.values[ValueModesKeys.Wrapped] = values[ValueModesKeys.Wrapped];
  }

  private async immediatelyPersistValuesToDisk(): Promise<StorageValuesObject> {
    return this.executeCriticalFunction(async () => {
      const values = await this.generatePersistableValues();
      await this.deviceInterface!.setRawStorageValue(
        this.getPersistenceKey(),
        JSON.stringify(values)
      );
      return values;
    });
  }

  /**
   * Generates a payload that can be persisted to disk,
   * either as a plain object, or an encrypted item.
   */
  private async generatePersistableValues() {
    const rawContent = Object.assign(
      {},
      this.values
    );
    const valuesToWrap = rawContent[ValueModesKeys.Unwrapped];
    const payload = CreateMaxPayloadFromAnyObject(
      {
        uuid: await Uuid.GenerateUuid(),
        content: valuesToWrap as PayloadContent,
        content_type: ContentType.EncryptedStorage
      }
    );
    const encryptedPayload = await this.encryptionDelegate!.payloadByEncryptingPayload(
      payload,
      EncryptionIntent.LocalStoragePreferEncrypted
    );
    rawContent[ValueModesKeys.Wrapped] = encryptedPayload.ejected();
    rawContent[ValueModesKeys.Unwrapped] = undefined;
    return rawContent;
  }

  public async setValue(key: string, value: any, mode = StorageValueModes.Default) {
    if (!this.values) {
      throw Error(`Attempting to set storage key ${key} before loading local storage.`);
    }
    this.values[this.domainKeyForMode(mode)]![key] = value;
    return this.persistValuesToDisk();
  }

  public async getValue(key: string, mode = StorageValueModes.Default) {
    if (!this.values) {
      throw Error(`Attempting to get storage key ${key} before loading local storage.`);
    }
    if (!this.values[this.domainKeyForMode(mode)]) {
      throw Error(`Storage domain mode not available ${mode} for key ${key}`);
    }
    return this.values[this.domainKeyForMode(mode)]![key];
  }

  public async removeValue(key: string, mode = StorageValueModes.Default) {
    if (!this.values) {
      throw Error(`Attempting to remove storage key ${key} before loading local storage.`);
    }
    const domain = this.values[this.domainKeyForMode(mode)];
    if (domain?.[key]) {
      delete domain[key];
      return this.persistValuesToDisk();
    }
  }

  public getStorageEncryptionPolicy() {
    return this.encryptionPolicy;
  }

  /**
   * Default persistence key. Platforms can override as needed.
   */
  private getPersistenceKey() {
    return namespacedKey(this.namespace, RawStorageKey.StorageObject);
  }

  private defaultValuesObject(
    wrapped?: ValuesObjectRecord,
    unwrapped?: ValuesObjectRecord,
    nonwrapped?: ValuesObjectRecord
  ) {
    return SNStorageService.defaultValuesObject(
      wrapped,
      unwrapped,
      nonwrapped
    );
  }

  public static defaultValuesObject(
    wrapped: ValuesObjectRecord = {},
    unwrapped: ValuesObjectRecord = {},
    nonwrapped: ValuesObjectRecord = {}
  ) {
    return {
      [ValueModesKeys.Wrapped]: wrapped,
      [ValueModesKeys.Unwrapped]: unwrapped,
      [ValueModesKeys.Nonwrapped]: nonwrapped
    } as StorageValuesObject;
  }

  private domainKeyForMode(mode: StorageValueModes) {
    if (mode === StorageValueModes.Default) {
      return ValueModesKeys.Unwrapped;
    } else if (mode === StorageValueModes.Nonwrapped) {
      return ValueModesKeys.Nonwrapped;
    } else {
      throw Error('Invalid mode');
    }
  }

  /**
   * Clears simple values from storage only. Does not affect payloads.
   */
  async clearValues() {
    this.setInitialValues();
    await this.immediatelyPersistValuesToDisk();
  }

  public async getAllRawPayloads() {
    return this.deviceInterface!.getAllRawDatabasePayloads();
  }

  public async savePayload(payload: PurePayload) {
    return this.savePayloads([payload]);
  }

  public async savePayloads(decryptedPayloads: PurePayload[]) {
    if (this.persistencePolicy === StoragePersistencePolicies.Ephemeral) {
      return;
    }

    const nondeleted: any[] = [];
    for (const payload of decryptedPayloads) {
      if (payload.discardable) {
        /** If the payload is deleted and not dirty, remove it from db. */
        await this.deletePayloadWithId(payload.uuid!);
      } else {
        if (!payload.uuid) {
          throw Error('Attempting to persist payload with no uuid');
        }
        const encrypted = await this.encryptionDelegate!.payloadByEncryptingPayload(
          payload,
          this.encryptionPolicy === StorageEncryptionPolicies.Default
            ? EncryptionIntent.LocalStoragePreferEncrypted
            : EncryptionIntent.LocalStorageDecrypted
        );
        nondeleted.push(encrypted.ejected());
      }
    }

    return this.executeCriticalFunction(async () => {
      return this.deviceInterface!.saveRawDatabasePayloads(nondeleted);
    });
  }

  public async deletePayloads(payloads: PurePayload[]) {
    for (const payload of payloads) {
      await this.deletePayloadWithId(payload.uuid!);
    }
  }

  public async deletePayloadWithId(id: string) {
    return this.executeCriticalFunction(async () => {
      return this.deviceInterface!.removeRawDatabasePayloadWithId(id);
    });
  }

  public async clearAllPayloads() {
    return this.executeCriticalFunction(async () => {
      return this.deviceInterface!.removeAllRawDatabasePayloads();
    });
  }

  public async clearAllData() {
    return Promise.all([
      this.clearValues(),
      this.clearAllPayloads()
    ]);
  }
}
