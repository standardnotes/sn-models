import { CollectionSort, SortDirection } from './protocol/collection/item_collection';
import { PayloadOverride } from './protocol/payloads/generator';
import { UuidString, ApplicationIdentifier, DeinitSource } from './types';
import { ApplicationEvent } from './events';
import { StorageEncryptionPolicies } from './services/storage_service';
import { BackupFile } from './services/protocol_service';
import { EncryptionIntent } from './protocol/intents';
import { SyncOptions } from './services/sync/sync_service';
import { SNSmartTag } from './models/app/smartTag';
import { SNItem, ItemMutator } from './models/core/item';
import { SNPredicate } from './models/core/predicate';
import { PurePayload } from './protocol/payloads/pure_payload';
import { Challenge, ChallengeResponse, ChallengeValue } from './challenges';
import { ChallengeObserver } from './services/challenge/challenge_service';
import { SNPureCrypto } from '@standardnotes/sncrypto';
import { Environment, Platform } from './platforms';
import { ContentType } from './models/content_types';
import { PayloadContent } from './protocol/payloads/generator';
import { PayloadSource } from './protocol/payloads/sources';
import { StorageValueModes } from './services/storage_service';
import { SNActionsService, SNProtocolService, SNPrivilegesService, SNHistoryManager, SNAlertService, SNComponentManager, SNSingletonManager } from './services';
import { DeviceInterface } from './device_interface';
import { SNComponent, SNTag, SNNote } from './models';
import { ProtocolVersion } from './protocol/versions';
import { KeyParamsOrigination } from './protocol/key_params';
declare type LaunchCallback = {
    receiveChallenge: (challenge: Challenge) => void;
};
declare type ApplicationEventCallback = (event: ApplicationEvent, data?: any) => Promise<void>;
declare type ItemStream = (items: SNItem[], source?: PayloadSource) => void;
/** The main entrypoint of an application. */
export declare class SNApplication {
    environment: Environment;
    platform: Platform;
    identifier: ApplicationIdentifier;
    private swapClasses?;
    private skipClasses?;
    private defaultHost?;
    private onDeinit?;
    private crypto?;
    deviceInterface?: DeviceInterface;
    private migrationService;
    alertService: SNAlertService;
    private httpService;
    private modelManager;
    protocolService: SNProtocolService;
    private storageService;
    private apiService;
    private sessionManager;
    private syncService;
    private challengeService;
    singletonManager: SNSingletonManager;
    componentManager: SNComponentManager;
    privilegesService: SNPrivilegesService;
    actionsManager: SNActionsService;
    historyManager: SNHistoryManager;
    private itemManager;
    private keyRecoveryService;
    private eventHandlers;
    private services;
    private streamRemovers;
    private serviceObservers;
    private managedSubscribers;
    private autoSyncInterval;
    /** True if the result of deviceInterface.openDatabase yields a new database being created */
    private createdNewDatabase;
    /** True if the application has started (but not necessarily launched) */
    private started;
    /** True if the application has launched */
    private launched;
    /** Whether the application has been destroyed via .deinit() */
    private dealloced;
    private signingIn;
    private registering;
    /**
     * @param environment The Environment that identifies your application.
     * @param platform The Platform that identifies your application.
     * @param deviceInterface The device interface that provides platform specific
     * utilities that are used to read/write raw values from/to the database or value storage.
     * @param crypto The platform-dependent implementation of SNPureCrypto to use.
     * Web uses SNWebCrypto, mobile uses SNReactNativeCrypto.
     * @param alertService The platform-dependent implementation of alert service.
     * @param identifier A unique identifier to namespace storage and other
     * persistent properties. This parameter is kept for backward compatibility and/or in case
     * you don't want SNNamespaceService to assign a dynamic namespace for you.
     * @param swapClasses Gives consumers the ability to provide their own custom
     * subclass for a service. swapClasses should be an array of key/value pairs
     * consisting of keys 'swap' and 'with'. 'swap' is the base class you wish to replace,
     * and 'with' is the custom subclass to use.
     * @param skipClasses An array of classes to skip making services for.
     * @param defaultHost Default host to use in ApiService.
     */
    constructor(environment: Environment, platform: Platform, deviceInterface: DeviceInterface, crypto: SNPureCrypto, alertService: SNAlertService, identifier: ApplicationIdentifier, swapClasses?: {
        swap: any;
        with: any;
    }[], skipClasses?: any[], defaultHost?: string);
    /**
     * The first thing consumers should call when starting their app.
     * This function will load all services in their correct order.
     */
    prepareForLaunch(callback: LaunchCallback): Promise<void>;
    private setLaunchCallback;
    /**
     * Handles device authentication, unlocks application, and
     * issues a callback if a device activation requires user input
     * (i.e local passcode or fingerprint).
     * @param awaitDatabaseLoad
     * Option to await database load before marking the app as ready.
     */
    launch(awaitDatabaseLoad?: boolean): Promise<void>;
    onStart(): void;
    onLaunch(): void;
    private handleLaunchChallengeResponse;
    private beginAutoSyncTimer;
    private handleStage;
    /**
     * @param singleEvent Whether to only listen for a particular event.
     */
    addEventObserver(callback: ApplicationEventCallback, singleEvent?: ApplicationEvent): () => void;
    addSingleEventObserver(event: ApplicationEvent, callback: ApplicationEventCallback): () => void;
    private notifyEvent;
    /**
     * Whether the local database has completed loading local items.
     */
    isDatabaseLoaded(): boolean;
    savePayload(payload: PurePayload): Promise<void>;
    /**
     * Finds an item by UUID.
     */
    findItem(uuid: string): SNItem | undefined;
    /**
     * Returns all items.
     */
    allItems(): SNItem[];
    /**
     * Finds an item by predicate.
    */
    findItems(predicate: SNPredicate): SNItem[];
    /**
     * Finds an item by predicate.
     */
    getAll(uuids: UuidString[]): (SNItem | undefined)[];
    /**
     * Takes the values of the input item and emits it onto global state.
     */
    mergeItem(item: SNItem, source: PayloadSource): Promise<SNItem>;
    /**
     * Creates a managed item.
     * @param needsSync  Whether to mark the item as needing sync. `add` must also be true.
     */
    createManagedItem(contentType: ContentType, content: PayloadContent, needsSync?: boolean, override?: PayloadOverride): Promise<SNItem>;
    /**
     * Creates an unmanaged item that can be added later.
     * @param needsSync  Whether to mark the item as needing sync. `add` must also be true.
     */
    createTemplateItem(contentType: ContentType, content?: PayloadContent): Promise<SNItem>;
    /**
     * Creates an unmanaged item from a payload.
     */
    createItemFromPayload(payload: PurePayload): SNItem;
    /**
     * Creates an unmanaged payload from any object, where the raw object
     * represents the same data a payload would.
     */
    createPayloadFromObject(object: any): PurePayload;
    /**
     * @returns The date of last sync
     */
    getLastSyncDate(): Date | undefined;
    getSyncStatus(): import("./services/sync/sync_op_status").SyncOpStatus;
    /**
     * @param isUserModified  Whether to change the modified date the user
     * sees of the item.
     */
    setItemNeedsSync(item: SNItem, isUserModified?: boolean): Promise<SNItem | undefined>;
    setItemsNeedsSync(items: SNItem[]): Promise<(SNItem | undefined)[]>;
    deleteItem(item: SNItem): Promise<any>;
    deleteItemLocally(item: SNItem): Promise<void>;
    emptyTrash(): Promise<any>;
    getTrashedItems(): SNNote[];
    setDisplayOptions<T extends SNItem>(contentType: ContentType, sortBy?: CollectionSort, direction?: SortDirection, filter?: (element: T) => boolean): void;
    setNotesDisplayOptions(tag?: SNTag, sortBy?: CollectionSort, direction?: SortDirection, filter?: (element: SNNote) => boolean): void;
    getDisplayableItems(contentType: ContentType): (SNItem | undefined)[];
    /**
     * Inserts the input item by its payload properties, and marks the item as dirty.
     * A sync is not performed after an item is inserted. This must be handled by the caller.
     */
    insertItem(item: SNItem): Promise<SNItem>;
    /**
     * Saves the item by uuid by finding it, setting it as dirty if its not already,
     * and performing a sync request.
     */
    saveItem(uuid: UuidString): Promise<void>;
    /**
     * Mutates a pre-existing item, marks it as dirty, and syncs it
     */
    changeAndSaveItem<M extends ItemMutator = ItemMutator>(uuid: UuidString, mutate?: (mutator: M) => void, isUserModified?: boolean, payloadSource?: PayloadSource, syncOptions?: SyncOptions): Promise<SNItem | undefined>;
    /**
    * Mutates pre-existing items, marks them as dirty, and syncs
    */
    changeAndSaveItems<M extends ItemMutator = ItemMutator>(uuids: UuidString[], mutate?: (mutator: M) => void, isUserModified?: boolean, payloadSource?: PayloadSource, syncOptions?: SyncOptions): Promise<void>;
    /**
    * Mutates a pre-existing item and marks it as dirty. Does not sync changes.
    */
    changeItem<M extends ItemMutator>(uuid: UuidString, mutate?: (mutator: M) => void, isUserModified?: boolean): Promise<SNItem | undefined>;
    /**
     * Mutates a pre-existing items and marks them as dirty. Does not sync changes.
     */
    changeItems<M extends ItemMutator = ItemMutator>(uuids: UuidString[], mutate?: (mutator: M) => void, isUserModified?: boolean): Promise<(SNItem | undefined)[]>;
    getItems(contentType: ContentType | ContentType[]): SNItem[];
    notesMatchingSmartTag(smartTag: SNSmartTag): SNNote[];
    /** Returns an item's direct references */
    referencesForItem(item: SNItem, contentType?: ContentType): SNItem[];
    /** Returns items referencing an item */
    referencingForItem(item: SNItem, contentType?: ContentType): SNItem[];
    duplicateItem<T extends SNItem>(item: T, additionalContent?: Partial<PayloadContent>): Promise<T>;
    findTagByTitle(title: string): SNTag | undefined;
    findOrCreateTag(title: string): Promise<SNTag>;
    getSmartTags(): SNSmartTag[];
    getNoteCount(): number;
    /**
     * Begin streaming items to display in the UI. The stream callback will be called
     * immediately with the present items that match the constraint, and over time whenever
     * items matching the constraint are added, changed, or deleted.
     */
    streamItems(contentType: ContentType | ContentType[], stream: ItemStream): () => void;
    /**
     * Activates or deactivates a component, depending on its
     * current state, and syncs.
     */
    toggleComponent(component: SNComponent): Promise<any>;
    /**
     * Set the server's URL
     */
    setHost(host: string): Promise<void>;
    getHost(): Promise<string | undefined>;
    getUser(): {
        uuid: string;
        email?: string | undefined;
    } | undefined;
    getProtocolEncryptionDisplayName(): Promise<string | undefined>;
    getUserVersion(): Promise<ProtocolVersion | undefined>;
    /**
     * Returns true if there is an upgrade available for the account or passcode
     */
    protocolUpgradeAvailable(): Promise<boolean>;
    /**
     * Returns true if there is an encryption source available
     */
    isEncryptionAvailable(): boolean;
    private performProtocolUpgrade;
    upgradeProtocolVersion(): Promise<{
        success?: true | undefined;
        canceled?: true | undefined;
        error?: {
            message: string;
        } | undefined;
    }>;
    noAccount(): boolean;
    hasAccount(): boolean;
    /**
     * @returns
     * .affectedItems: Items that were either created or dirtied by this import
     * .errorCount: The number of items that were not imported due to failure to decrypt.
     */
    importData(data: BackupFile, password?: string, awaitSync?: boolean): Promise<{
        affectedItems: SNItem[];
        errorCount: number;
    } | {
        error: string;
    }>;
    /**
     * Creates a JSON string representing the backup format of all items, or just subItems
     * if supplied.
     */
    createBackupFile(subItems?: SNItem[], intent?: EncryptionIntent, returnIfEmpty?: boolean): Promise<string | undefined>;
    isEphemeralSession(): boolean;
    private lockSyncing;
    private unlockSyncing;
    sync(options?: SyncOptions): Promise<any>;
    isOutOfSync(): Promise<boolean>;
    resolveOutOfSync(): Promise<any>;
    setValue(key: string, value: any, mode?: StorageValueModes): Promise<void>;
    getValue(key: string, mode?: StorageValueModes): Promise<any>;
    removeValue(key: string, mode?: StorageValueModes): Promise<void>;
    /**
     * Deletes all payloads from storage.
     */
    clearDatabase(): Promise<void>;
    /**
     * Allows items keys to be rewritten to local db on local credential status change,
     * such as if passcode is added, changed, or removed.
     * This allows IndexedDB unencrypted logs to be deleted
     * `deletePayloads` will remove data from backing store,
     * but not from working memory See:
     * https://github.com/standardnotes/desktop/issues/131
     */
    private rewriteItemsKeys;
    /**
     * Gives services a chance to complete any sensitive operations before yielding
     * @param maxWait The maximum number of milliseconds to wait for services
     * to finish tasks. 0 means no limit.
     */
    prepareForDeinit(maxWait?: number): Promise<void>;
    promptForCustomChallenge(challenge: Challenge): Promise<ChallengeResponse | undefined>;
    addChallengeObserver(challenge: Challenge, observer: ChallengeObserver): () => void;
    submitValuesForChallenge(challenge: Challenge, values: ChallengeValue[]): Promise<void>;
    cancelChallenge(challenge: Challenge): void;
    /** Set a function to be called when this application deinits */
    setOnDeinit(onDeinit: (app: SNApplication, source: DeinitSource) => void): void;
    /**
     * Destroys the application instance.
     */
    deinit(source: DeinitSource): void;
    /**
     *  @param mergeLocal  Whether to merge existing offline data into account. If false,
     *                     any pre-existing data will be fully deleted upon success.
     */
    register(email: string, password: string, ephemeral?: boolean, mergeLocal?: boolean): Promise<import("./services/api/responses").HttpResponse>;
    /**
     * @param mergeLocal  Whether to merge existing offline data into account.
     * If false, any pre-existing data will be fully deleted upon success.
     */
    signIn(email: string, password: string, strict?: boolean, ephemeral?: boolean, mergeLocal?: boolean, awaitSync?: boolean): Promise<import("./services/api/responses").HttpResponse>;
    /**
     * @param passcode - Changing the account password requires the local
     * passcode if configured (to rewrap the account key with passcode). If the passcode
     * is not passed in, the user will be prompted for the passcode. However if the consumer
     * already has reference to the passcode, they can pass it in here so that the user
     * is not prompted again.
     */
    changePassword(currentPassword: string, newPassword: string, passcode?: string, origination?: KeyParamsOrigination, { validatePasswordStrength }?: {
        validatePasswordStrength?: boolean | undefined;
    }): Promise<{
        error?: {
            message: string;
        } | undefined;
    }>;
    private performPasswordChange;
    signOut(): Promise<void>;
    validateAccountPassword(password: string): Promise<boolean>;
    isStarted(): boolean;
    isLaunched(): boolean;
    hasBiometrics(): Promise<boolean>;
    enableBiometrics(): Promise<void>;
    disableBiometrics(): Promise<void>;
    hasPasscode(): boolean;
    isLocked(): Promise<boolean>;
    lock(): Promise<void>;
    setPasscode(passcode: string): Promise<void>;
    removePasscode(): Promise<void>;
    changePasscode(passcode: string, origination?: KeyParamsOrigination): Promise<void>;
    private setPasscodeWithoutWarning;
    private removePasscodeWithoutWarning;
    getStorageEncryptionPolicy(): StorageEncryptionPolicies;
    setStorageEncryptionPolicy(encryptionPolicy: StorageEncryptionPolicies): Promise<void>;
    enableEphemeralPersistencePolicy(): Promise<void>;
    hasPendingMigrations(): Promise<boolean>;
    generateUuid(): Promise<string>;
    presentKeyRecoveryWizard(): Promise<void>;
    /**
     * Dynamically change the device interface, i.e when Desktop wants to override
     * default web interface.
     */
    changeDeviceInterface(deviceInterface: DeviceInterface): Promise<void>;
    private constructServices;
    private clearServices;
    private createMigrationService;
    private createApiService;
    private createItemManager;
    private createComponentManager;
    private createHttpManager;
    private createModelManager;
    private createSingletonManager;
    private createStorageManager;
    private createProtocolService;
    private createKeyRecoveryService;
    private createSessionManager;
    private createSyncManager;
    private createChallengeService;
    private createPrivilegesService;
    private createHistoryManager;
    private createActionsManager;
    private shouldSkipClass;
    private getClass;
}
export {};
