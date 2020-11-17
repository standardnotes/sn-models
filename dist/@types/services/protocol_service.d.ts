import { ApplicationIdentifier } from './../types';
import { EncryptionIntent } from './../protocol/intents';
import { ProtocolVersion } from './../protocol/versions';
import { ItemManager } from './item_manager';
import { EncryptionDelegate } from './encryption_delegate';
import { SyncEvent } from '../events';
import { SNItem } from '../models/core/item';
import { PurePayload } from '../protocol/payloads/pure_payload';
import { SNItemsKey } from '../models/app/items_key';
import { SNRootKeyParams, AnyKeyParamsContent, KeyParamsOrigination } from './../protocol/key_params';
import { SNStorageService } from './storage_service';
import { SNRootKey } from '../protocol/root_key';
import { PayloadManager } from './model_manager';
import { PureService } from './pure_service';
import { SNPureCrypto } from '@standardnotes/sncrypto';
import { V001Algorithm, V002Algorithm } from '../protocol/operator/algorithms';
import { DeviceInterface } from '../device_interface';
export declare type BackupFile = {
    version?: ProtocolVersion;
    keyParams?: any;
    auth_params?: any;
    items: any[];
};
declare type KeyChangeObserver = () => Promise<void>;
export declare enum KeyMode {
    /** i.e No account and no passcode */
    RootKeyNone = 0,
    /** i.e Account but no passcode */
    RootKeyOnly = 1,
    /** i.e Account plus passcode */
    RootKeyPlusWrapper = 2,
    /** i.e No account, but passcode */
    WrapperOnly = 3
}
/**
 * The protocol service is responsible for the encryption and decryption of payloads, and
 * handles delegation of a task to the respective protocol operator. Each version of the protocol
 * (001, 002, 003, 004, etc) uses a respective operator version to perform encryption operations.
 * Operators are located in /protocol/operator.
 * The protocol service depends on the keyManager for determining which key to use for the
 * encryption and decryption of a particular payload.
 * The protocol service is also responsible for dictating which protocol versions are valid,
 * and which are no longer valid or not supported.

 * The key manager is responsible for managing root key and root key wrapper states.
 * When the key manager is initialized, it initiates itself with a keyMode, which
 * dictates the entire flow of key management. The key manager's responsibilities include:
 * - interacting with the device keychain to save or clear the root key
 * - interacting with storage to save root key params or wrapper params, or the wrapped root key.
 * - exposing methods that allow the application to unwrap the root key (unlock the application)
 *
 * It also exposes two primary methods for determining what key should be used to encrypt
 * or decrypt a particular payload. Some payloads are encrypted directly with the rootKey
 * (such as itemsKeys and encryptedStorage). Others are encrypted with itemsKeys (notes, tags, etc).

 * The items key manager manages the lifecycle of items keys.
 * It is responsible for creating the default items key when conditions call for it
 * (such as after the first sync completes and no key exists).
 * It also exposes public methods that allows consumers to retrieve an items key
 * for a particular payload, and also retrieve all available items keys.
*/
export declare class SNProtocolService extends PureService implements EncryptionDelegate {
    private identifier;
    private itemManager?;
    private modelManager?;
    private storageService?;
    crypto: SNPureCrypto;
    private operators;
    private keyMode;
    private keyObservers;
    private rootKey?;
    private removeItemsObserver;
    constructor(itemManager: ItemManager, modelManager: PayloadManager, deviceInterface: DeviceInterface, storageService: SNStorageService, identifier: ApplicationIdentifier, crypto: SNPureCrypto);
    /** @override */
    deinit(): void;
    initialize(): Promise<void>;
    private getEncryptionSourceVersion;
    /**
     * Returns encryption protocol display name for active account/wrapper
     */
    getEncryptionDisplayName(): Promise<string | undefined>;
    /**
     * Returns the latest protocol version
     */
    getLatestVersion(): ProtocolVersion;
    hasAccount(): boolean;
    /**
     * Returns the protocol version associated with the user's account
     */
    getUserVersion(): Promise<ProtocolVersion | undefined>;
    /**
     * Returns true if there is an upgrade available for the account or passcode
     */
    upgradeAvailable(): Promise<boolean>;
    /**
     * Returns true if the user's account protocol version is not equal to the latest version.
     */
    accountUpgradeAvailable(): Promise<boolean>;
    /**
     * Returns true if the user's account protocol version is not equal to the latest version.
     */
    passcodeUpgradeAvailable(): Promise<boolean>;
    /**
     * Determines whether the current environment is capable of supporting
     * key derivation.
     */
    platformSupportsKeyDerivation(keyParams: SNRootKeyParams): boolean;
    /**
     * @returns The versions that this library supports.
     */
    supportedVersions(): ProtocolVersion[];
    /**
     * Determines whether the input version is greater than the latest supported library version.
     */
    isVersionNewerThanLibraryVersion(version: ProtocolVersion): boolean;
    /**
     * Determines whether the input version is expired
     */
    isProtocolVersionOutdated(version: ProtocolVersion): boolean;
    /**
     * Versions 001 and 002 of the protocol supported dynamic costs, as reported by the server.
     * This function returns the client-enforced minimum cost, to prevent the server from
     * overwhelmingly under-reporting the cost.
     */
    costMinimumForVersion(version: ProtocolVersion): V001Algorithm.PbkdfMinCost | V002Algorithm.PbkdfMinCost;
    private createOperatorForLatestVersion;
    private createOperatorForVersion;
    private operatorForVersion;
    /**
     * Returns the operator corresponding to the latest protocol version
     */
    private defaultOperator;
    /**
     * Computes a root key given a password and key params.
     * Delegates computation to respective protocol operator.
     */
    computeRootKey(password: string, keyParams: SNRootKeyParams): Promise<SNRootKey>;
    /**
     * Creates a root key using the latest protocol version
    */
    createRootKey(identifier: string, password: string, origination: KeyParamsOrigination, version?: ProtocolVersion): Promise<SNRootKey>;
    /**
     * Given a key and intent, returns the proper PayloadFormat,
     * or throws an exception if unsupported configuration of parameters.
     */
    private payloadContentFormatForIntent;
    /**
     * Generates parameters for a payload that are typically encrypted, and used for syncing
     * or saving locally. Parameters are non-typed objects that can later by converted to objects.
     * If the input payload is not properly decrypted in the first place, it will be returned
     * as-is. If the payload is deleted, it will be returned as-is (assuming that the content field is null)
     * @param payload - The payload to encrypt
     * @param key The key to use to encrypt the payload.
     *   Will be looked up if not supplied.
     * @param intent - The target of the encryption
     * @returns The encrypted payload
     */
    payloadByEncryptingPayload(payload: PurePayload, intent: EncryptionIntent, key?: SNRootKey | SNItemsKey): Promise<PurePayload>;
    /**
     * Similar to `payloadByEncryptingPayload`, but operates on an array of payloads.
     * `intent` can also be a function of the current iteration payload.
     */
    payloadsByEncryptingPayloads(payloads: PurePayload[], intent: EncryptionIntent | ((payload: PurePayload) => EncryptionIntent), key?: SNRootKey | SNItemsKey): Promise<PurePayload[]>;
    /**
     * Generates a new payload by decrypting the input payload.
     * If the input payload is already decrypted, it will be returned as-is.
     * @param payload - The payload to decrypt.
     * @param key The key to use to decrypt the payload.
     * If none is supplied, it will be automatically looked up.
     */
    payloadByDecryptingPayload(payload: PurePayload, key?: SNRootKey | SNItemsKey): Promise<PurePayload>;
    /**
     * Similar to `payloadByDecryptingPayload`, but operates on an array of payloads.
     */
    payloadsByDecryptingPayloads(payloads: PurePayload[], key?: SNRootKey | SNItemsKey): Promise<PurePayload[]>;
    /**
     * If an item was attempting to decrypt, but failed, either because the keys
     * for that item had not downloaded yet, or any other reason, it will be deferred
     * item.errorDecrypting = true and possibly item.waitingForKey = true.
     * Here we find such items, and attempt to decrypt them again.
     */
    decryptErroredItems(): Promise<void>;
    /**
     * Decrypts a backup file using user-inputted password
     * @param password - The raw user password associated with this backup file
     */
    payloadsByDecryptingBackupFile(data: BackupFile, password?: string): Promise<PurePayload[]>;
    /**
     * Creates a key params object from a raw object
     * @param keyParams - The raw key params object to create a KeyParams object from
     */
    createKeyParams(keyParams: AnyKeyParamsContent): SNRootKeyParams;
    /**
     * Creates a JSON string representing the backup format of all items, or just subitems
     * if supplied.
     * @param subItems An optional array of items to create backup of.
     * If not supplied, all items are backed up.
     * @param returnIfEmpty Returns null if there are no items to make backup of.
     * @returns JSON stringified representation of data, including keyParams.
     */
    createBackupFile(subItems?: SNItem[], intent?: EncryptionIntent, returnIfEmpty?: boolean): Promise<string | undefined>;
    /**
     * Register a callback to be notified when root key status changes.
     * @param callback  A function that takes in a content type to call back when root
     *                  key or wrapper status has changed.
     */
    onKeyStatusChange(callback: KeyChangeObserver): () => void;
    private notifyObserversOfKeyChange;
    private getRootKeyFromKeychain;
    private saveRootKeyToKeychain;
    /**
     * @returns True if a root key wrapper (passcode) is configured.
     */
    hasRootKeyWrapper(): Promise<boolean>;
    /**
     * A non-async alternative to `hasRootKeyWrapper` which uses pre-loaded state
     * to determine if a passcode is configured.
     */
    hasPasscode(): boolean;
    /**
     * @returns True if the root key has not yet been unwrapped (passcode locked).
     */
    rootKeyNeedsUnwrapping(): Promise<boolean>;
    /**
     * @returns Key params object containing root key wrapper key params
     */
    getRootKeyWrapperKeyParams(): Promise<SNRootKeyParams | undefined>;
    /**
     * @returns Object containing persisted wrapped (encrypted) root key
     */
    private getWrappedRootKey;
    /**
     * Returns rootKeyParams by reading from storage.
     */
    getRootKeyParams(): Promise<SNRootKeyParams | undefined>;
    /**
     * @returns getRootKeyParams may return different params based on different
     *           keyMode. This function however strictly returns only account params.
     */
    getAccountKeyParams(): Promise<SNRootKeyParams | undefined>;
    /**
     * We know a wrappingKey is correct if it correctly decrypts
     * wrapped root key.
     */
    validateWrappingKey(wrappingKey: SNRootKey): Promise<boolean>;
    /**
     * Computes the root key wrapping key given a passcode.
     * Wrapping key params are read from disk.
     */
    computeWrappingKey(passcode: string): Promise<SNRootKey>;
    /**
     * Unwraps the persisted root key value using the supplied wrappingKey.
     * Application interfaces must check to see if the root key requires unwrapping on load.
     * If so, they must generate the unwrapping key by getting our saved wrapping key keyParams.
     * After unwrapping, the root key is automatically loaded.
     */
    unwrapRootKey(wrappingKey: SNRootKey): Promise<void>;
    /**
     * Encrypts rootKey and saves it in storage instead of keychain, and then
     * clears keychain. This is because we don't want to store large encrypted
     * payloads in the keychain. If the root key is not wrapped, it is stored
     * in plain form in the user's secure keychain.
    */
    setNewRootKeyWrapper(wrappingKey: SNRootKey): Promise<void>;
    /**
     * Wraps the current in-memory root key value using the wrappingKey,
     * then persists the wrapped value to disk.
     */
    private wrapAndPersistRootKey;
    /**
     * Removes root key wrapper from local storage and stores root key bare in secure keychain.
     */
    removeRootKeyWrapper(): Promise<void>;
    /**
     * The root key is distinct from regular keys and are only saved locally in the keychain,
     * in non-item form. Applications set root key on sign in, register, or password change.
     * @param key A SNRootKey object.
     * @param wrappingKey If a passcode is configured, the wrapping key
     * must be supplied, so that the new root key can be wrapped with the wrapping key.
     */
    setRootKey(key: SNRootKey, wrappingKey?: SNRootKey): Promise<void>;
    /**
     * Returns the in-memory root key value.
     */
    getRootKey(): SNRootKey | undefined;
    /**
     * Deletes root key and wrapper from keychain. Used when signing out of application.
     */
    clearLocalKeyState(): Promise<void>;
    /**
     * @param password  The password string to generate a root key from.
     */
    validateAccountPassword(password: string): Promise<{
        valid: true;
        artifacts: {
            rootKey: SNRootKey;
        };
    } | {
        valid: boolean;
        artifacts?: undefined;
    }>;
    /**
     * @param passcode  The passcode string to generate a root key from.
     */
    validatePasscode(passcode: string): Promise<{
        valid: true;
        artifacts: {
            wrappingKey: SNRootKey;
        };
    } | {
        valid: boolean;
        artifacts?: undefined;
    }>;
    /**
     * Determines which key to use for encryption of the payload
     * The key object to use for encrypting the payload.
    */
    private keyToUseForEncryptionOfPayload;
    /**
     * Payloads could have been previously encrypted with any arbitrary SNItemsKey object.
     * If the payload is an items key object, it is always encrypted with the root key,
     * and so return that. Otherwise, we check to see if the payload has an
     * items_key_id and return that key. If it doesn't, this means the payload was
     * encrypted with legacy behavior. We return then the key object corresponding
     * to the version of this payload.
     * @returns The key object to use for decrypting this payload.
    */
    private keyToUseForDecryptionOfPayload;
    onSyncEvent(eventName: SyncEvent): Promise<void>;
    /**
     * When a download-first sync completes, it means we've completed a (potentially multipage)
     * sync where we only downloaded what the server had before uploading anything. We will be
     * allowed to make local accomadations here before the server begins with the upload
     * part of the sync (automatically runs after download-first sync completes).
     * We use this to see if the server has any default itemsKeys, and if so, allows us to
     * delete any never-synced items keys we have here locally.
     */
    private handleDownloadFirstSyncCompletion;
    private handleFullSyncCompletion;
    /**
     * If encryption status changes (esp. on mobile, where local storage encryption
     * can be disabled), consumers may call this function to repersist all items to
     * disk using latest encryption status.
     * @access public
     */
    repersistAllItems(): Promise<void>;
    /**
     * @returns All SN|ItemsKey objects synced to the account.
     */
    private latestItemsKeys;
    /**
     * @returns The items key used to encrypt the payload
     */
    itemsKeyForPayload(payload: PurePayload): SNItemsKey | undefined;
    /**
     * @returns The SNItemsKey object to use to encrypt new or updated items.
     */
    getDefaultItemsKey(): SNItemsKey | undefined;
    /** Returns the key params attached to this key's encrypted payload */
    getKeyEmbeddedKeyParams(key: SNItemsKey): Promise<SNRootKeyParams | undefined>;
    /**
     * When the root key changes (non-null only), we must re-encrypt all items
     * keys with this new root key (by simply re-syncing).
     */
    reencryptItemsKeys(): Promise<void>;
    /**
     * When migrating from non-SNItemsKey architecture, many items will not have a
     * relationship with any key object. For those items, we can be sure that only 1 key
     * object will correspond to that protocol version.
     * @returns The SNItemsKey object to decrypt items encrypted
     * with previous protocol version.
     */
    defaultItemsKeyForItemVersion(version: ProtocolVersion): Promise<SNItemsKey | undefined>;
    /**
     * Creates a new random SNItemsKey to use for item encryption, and adds it to model management.
     * Consumer must call sync. If the protocol version <= 003, only one items key should be created,
     * and its .itemsKey value should be equal to the root key masterKey value.
     */
    private createNewDefaultItemsKey;
    createNewItemsKeyWithRollback(): Promise<() => Promise<void>>;
}
export {};
