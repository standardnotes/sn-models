import { SyncOpStatus } from './services/sync/sync_op_status';
import { createMutatorForItem } from '@Lib/models/mutator';
import {
  SNCredentialService,
  PasswordChangeFunctionResponse,
  AccountServiceResponse,
  AccountEvent,
} from './services/credential_service';
import { NotesDisplayCriteria } from './protocol/collection/notes_display_criteria';
import { SNKeyRecoveryService } from './services/key_recovery_service';
import {
  CollectionSort,
  SortDirection,
} from '@Protocol/collection/item_collection';
import { Uuids } from '@Models/functions';
import { PayloadOverride } from './protocol/payloads/generator';
import { ApplicationStage } from '@Lib/stages';
import { ApplicationIdentifier, DeinitSource, UuidString } from './types';
import {
  ApplicationEvent,
  SyncEvent,
  applicationEventForSyncEvent,
} from '@Lib/events';
import { StorageEncryptionPolicies } from './services/storage_service';
import { Uuid } from '@Lib/uuid';
import { BackupFile } from './services/protocol_service';
import { EncryptionIntent } from '@Protocol/intents';
import { SyncOptions } from './services/sync/sync_service';
import { SNSmartTag } from './models/app/smartTag';
import { ItemMutator, MutationType, SNItem } from '@Models/core/item';
import { SNPredicate } from '@Models/core/predicate';
import { PurePayload } from '@Payloads/pure_payload';
import {
  Challenge,
  ChallengePrompt,
  ChallengeReason,
  ChallengeResponse,
  ChallengeValidation,
  ChallengeValue,
} from './challenges';
import { ChallengeObserver } from './services/challenge/challenge_service';
import { PureService } from '@Lib/services/pure_service';
import { SNPureCrypto } from '@standardnotes/sncrypto-common';
import { Environment, Platform } from './platforms';
import {
  assertUnreachable,
  isNullOrUndefined,
  isString,
  removeFromArray,
  sleep,
} from '@Lib/utils';
import { ContentType } from '@Models/content_types';
import {
  CopyPayload,
  CreateMaxPayloadFromAnyObject,
  PayloadContent,
} from '@Payloads/generator';
import { PayloadSource } from '@Payloads/sources';
import { CreateItemFromPayload } from '@Models/generator';
import {
  StoragePersistencePolicies,
  StorageValueModes,
} from '@Services/storage_service';
import {
  ChallengeService,
  ItemManager,
  PayloadManager,
  SNActionsService,
  SNAlertService,
  SNApiService,
  SNComponentManager,
  SNHistoryManager,
  SNHttpService,
  SNMigrationService,
  SNProtectionService,
  SNProtocolService,
  SNSessionManager,
  SNSingletonManager,
  SNStorageService,
  SNSyncService,
  SyncModes,
} from './services';
import { DeviceInterface } from './device_interface';
import {
  BACKUP_FILE_MORE_RECENT_THAN_ACCOUNT,
  ErrorAlertStrings,
  ProtocolUpgradeStrings,
  UNSUPPORTED_BACKUP_FILE_VERSION,
  SessionStrings,
  ImportStrings,
} from './services/api/messages';
import { SessionEvent } from './services/api/session_manager';
import { PrefKey, PrefValue, SNComponent, SNNote, SNTag } from './models';
import { ProtocolVersion, compareVersions } from './protocol/versions';
import { KeyParamsOrigination } from './protocol/key_params';
import { SNLog } from './log';
import { SNPreferencesService } from './services/preferences_service';
import { HttpResponse, User } from './services/api/responses';
import { RemoteSession } from './services/api/session';
import { PayloadFormat } from './protocol/payloads';
import { SNPermissionsService } from './services/permissions_service';
import { ProtectionEvent } from './services/protection_service';
import { Permission } from '@standardnotes/auth';
import { SNMfaService } from './services/api/mfa_service';

/** How often to automatically sync, in milliseconds */
const DEFAULT_AUTO_SYNC_INTERVAL = 30_000;

type LaunchCallback = {
  receiveChallenge: (challenge: Challenge) => void;
};
type ApplicationEventCallback = (
  event: ApplicationEvent,
  data?: any
) => Promise<void>;
type ApplicationObserver = {
  singleEvent?: ApplicationEvent;
  callback: ApplicationEventCallback;
};
type ItemStream = (items: SNItem[], source?: PayloadSource) => void;
type ObserverRemover = () => void;

/** The main entrypoint of an application. */
export class SNApplication {
  private onDeinit?: (app: SNApplication, source: DeinitSource) => void;

  private migrationService!: SNMigrationService;
  private httpService!: SNHttpService;
  private payloadManager!: PayloadManager;
  public protocolService!: SNProtocolService;
  private storageService!: SNStorageService;
  private apiService!: SNApiService;
  private sessionManager!: SNSessionManager;
  private syncService!: SNSyncService;
  private challengeService!: ChallengeService;
  public singletonManager!: SNSingletonManager;
  public componentManager!: SNComponentManager;
  public protectionService!: SNProtectionService;
  public actionsManager!: SNActionsService;
  public historyManager!: SNHistoryManager;
  private itemManager!: ItemManager;
  private keyRecoveryService!: SNKeyRecoveryService;
  private preferencesService!: SNPreferencesService;
  private permissionsService!: SNPermissionsService;
  private credentialService!: SNCredentialService;
  private mfaService!: SNMfaService;

  private eventHandlers: ApplicationObserver[] = [];
  private services: PureService<any, any>[] = [];
  private streamRemovers: ObserverRemover[] = [];
  private serviceObservers: ObserverRemover[] = [];
  private managedSubscribers: ObserverRemover[] = [];
  private autoSyncInterval!: number;

  /** True if the result of deviceInterface.openDatabase yields a new database being created */
  private createdNewDatabase = false;
  /** True if the application has started (but not necessarily launched) */
  private started = false;
  /** True if the application has launched */
  private launched = false;
  /** Whether the application has been destroyed via .deinit() */
  private dealloced = false;

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
  constructor(
    public environment: Environment,
    public platform: Platform,
    public deviceInterface: DeviceInterface,
    private crypto: SNPureCrypto,
    public alertService: SNAlertService,
    public identifier: ApplicationIdentifier,
    private swapClasses: { swap: any; with: any }[],
    private defaultHost: string
  ) {
    if (!SNLog.onLog) {
      throw Error('SNLog.onLog must be set.');
    }
    if (!SNLog.onError) {
      throw Error('SNLog.onError must be set.');
    }
    if (!deviceInterface) {
      throw Error('Device Interface must be supplied.');
    }
    if (!environment) {
      throw Error('Environment must be supplied when creating an application.');
    }
    if (!platform) {
      throw Error('Platform must be supplied when creating an application.');
    }
    if (!crypto) {
      throw Error('Crypto has to be supplied when creating an application.');
    }
    if (!alertService) {
      throw Error(
        'AlertService must be supplied when creating an application.'
      );
    }
    if (!identifier) {
      throw Error(
        'ApplicationIdentifier must be supplied when creating an application.'
      );
    }
    if (!swapClasses) {
      throw Error(
        'SwapClasses array must be supplied when creating an application.'
      );
    }
    if (!defaultHost) {
      throw Error('defaultHost must be supplied when creating an application.');
    }
    this.constructServices();
  }

  /**
   * The first thing consumers should call when starting their app.
   * This function will load all services in their correct order.
   */
  async prepareForLaunch(callback: LaunchCallback): Promise<void> {
    this.setLaunchCallback(callback);
    const databaseResult = await this.deviceInterface
      .openDatabase(this.identifier)
      .catch((error) => {
        void this.notifyEvent(ApplicationEvent.LocalDatabaseReadError, error);
        return undefined;
      });
    this.createdNewDatabase = databaseResult?.isNewDatabase || false;
    await this.migrationService.initialize();
    await this.notifyEvent(ApplicationEvent.MigrationsLoaded);
    await this.handleStage(ApplicationStage.PreparingForLaunch_0);
    await this.storageService.initializeFromDisk();
    await this.notifyEvent(ApplicationEvent.StorageReady);
    await this.protocolService.initialize();
    await this.handleStage(ApplicationStage.ReadyForLaunch_05);
    this.started = true;
    await this.notifyEvent(ApplicationEvent.Started);
  }

  private setLaunchCallback(callback: LaunchCallback) {
    this.challengeService.sendChallenge = callback.receiveChallenge;
  }

  /**
   * Handles device authentication, unlocks application, and
   * issues a callback if a device activation requires user input
   * (i.e local passcode or fingerprint).
   * @param awaitDatabaseLoad
   * Option to await database load before marking the app as ready.
   */
  public async launch(awaitDatabaseLoad = false): Promise<void> {
    this.launched = false;
    const launchChallenge = this.getLaunchChallenge();
    if (launchChallenge) {
      const response = await this.challengeService.promptForChallengeResponse(
        launchChallenge
      );
      if (!response) {
        throw Error('Launch challenge was cancelled.');
      }
      await this.handleLaunchChallengeResponse(response);
    }
    if (this.storageService.isStorageWrapped()) {
      try {
        await this.storageService.decryptStorage();
      } catch (_error) {
        void this.alertService.alert(
          ErrorAlertStrings.StorageDecryptErrorBody,
          ErrorAlertStrings.StorageDecryptErrorTitle
        );
      }
    }
    await this.handleStage(ApplicationStage.StorageDecrypted_09);
    await this.apiService.loadHost();
    await this.sessionManager.initializeFromDisk();
    this.historyManager.initializeFromDisk();

    this.launched = true;
    await this.notifyEvent(ApplicationEvent.Launched);
    await this.handleStage(ApplicationStage.Launched_10);

    const databasePayloads = await this.syncService.getDatabasePayloads();
    await this.handleStage(ApplicationStage.LoadingDatabase_11);

    if (this.createdNewDatabase) {
      await this.syncService.onNewDatabaseCreated();
    }
    /**
     * We don't want to await this, as we want to begin allowing the app to function
     * before local data has been loaded fully. We await only initial
     * `getDatabasePayloads` to lock in on database state.
     */
    const loadPromise = this.syncService
      .loadDatabasePayloads(databasePayloads)
      .then(async () => {
        if (this.dealloced) {
          throw 'Application has been destroyed.';
        }
        await this.handleStage(ApplicationStage.LoadedDatabase_12);
        this.beginAutoSyncTimer();
        await this.syncService.sync({
          mode: SyncModes.DownloadFirst,
        });
      });
    if (awaitDatabaseLoad) {
      await loadPromise;
    }
  }

  public onStart(): void {
    // optional override
  }

  public onLaunch(): void {
    // optional override
  }

  public getLaunchChallenge(): Challenge | undefined {
    return this.protectionService.createLaunchChallenge();
  }

  private async handleLaunchChallengeResponse(response: ChallengeResponse) {
    if (
      response.challenge.hasPromptForValidationType(
        ChallengeValidation.LocalPasscode
      )
    ) {
      let wrappingKey = response.artifacts?.wrappingKey;
      if (!wrappingKey) {
        const value = response.getValueForType(
          ChallengeValidation.LocalPasscode
        );
        wrappingKey = await this.protocolService.computeWrappingKey(
          value.value as string
        );
      }
      await this.protocolService.unwrapRootKey(wrappingKey);
    }
  }

  private beginAutoSyncTimer() {
    this.autoSyncInterval = this.deviceInterface.interval(() => {
      this.syncService.log('Syncing from autosync');
      void this.sync();
    }, DEFAULT_AUTO_SYNC_INTERVAL);
  }

  private async handleStage(stage: ApplicationStage) {
    for (const service of this.services) {
      await service.handleApplicationStage(stage);
    }
  }

  /**
   * @param singleEvent Whether to only listen for a particular event.
   */
  public addEventObserver(
    callback: ApplicationEventCallback,
    singleEvent?: ApplicationEvent
  ): () => void {
    const observer = { callback, singleEvent };
    this.eventHandlers.push(observer);
    return () => {
      removeFromArray(this.eventHandlers, observer);
    };
  }

  public addSingleEventObserver(
    event: ApplicationEvent,
    callback: ApplicationEventCallback
  ): () => void {
    const filteredCallback = async (firedEvent: ApplicationEvent) => {
      if (firedEvent === event) {
        void callback(event);
      }
    };
    return this.addEventObserver(filteredCallback, event);
  }

  private async notifyEvent(event: ApplicationEvent, data?: any) {
    if (event === ApplicationEvent.Started) {
      this.onStart();
    } else if (event === ApplicationEvent.Launched) {
      this.onLaunch();
    }
    for (const observer of this.eventHandlers.slice()) {
      if (observer.singleEvent && observer.singleEvent === event) {
        await observer.callback(event, data || {});
      } else if (!observer.singleEvent) {
        await observer.callback(event, data || {});
      }
    }
    void this.migrationService.handleApplicationEvent(event);
  }

  /**
   * Whether the local database has completed loading local items.
   */
  public isDatabaseLoaded(): boolean {
    return this.syncService.isDatabaseLoaded();
  }

  public async savePayload(payload: PurePayload): Promise<void> {
    const dirtied = CopyPayload(payload, {
      dirty: true,
      dirtiedDate: new Date(),
    });
    await this.payloadManager.emitPayload(dirtied, PayloadSource.LocalChanged);
    await this.syncService.sync();
  }

  /**
   * Finds an item by UUID.
   */
  public findItem(uuid: string): SNItem | undefined {
    return this.itemManager.findItem(uuid);
  }

  /**
   * Returns all items.
   */
  public allItems(): SNItem[] {
    return this.itemManager.items;
  }

  /**
   * Finds an item by predicate.
   */
  public findItems(predicate: SNPredicate): SNItem[] {
    return this.itemManager.itemsMatchingPredicate(predicate);
  }

  /**
   * Finds an item by predicate.
   */
  public getAll(uuids: UuidString[]): (SNItem | undefined)[] {
    return this.itemManager.findItems(uuids);
  }

  /**
   * Takes the values of the input item and emits it onto global state.
   */
  public async mergeItem(item: SNItem, source: PayloadSource): Promise<SNItem> {
    return this.itemManager.emitItemFromPayload(
      item.payloadRepresentation(),
      source
    );
  }

  /**
   * Creates a managed item.
   * @param needsSync  Whether to mark the item as needing sync. `add` must also be true.
   */
  public async createManagedItem(
    contentType: ContentType,
    content: PayloadContent,
    needsSync = false,
    override?: PayloadOverride
  ): Promise<SNItem> {
    return this.itemManager.createItem(
      contentType,
      content,
      needsSync,
      override
    );
  }

  /**
   * Creates an unmanaged item that can be added later.
   */
  public async createTemplateItem(
    contentType: ContentType,
    content?: PayloadContent
  ): Promise<SNItem> {
    return this.itemManager.createTemplateItem(contentType, content);
  }

  /**
   * Creates an unmanaged item from a payload.
   */
  public createItemFromPayload(payload: PurePayload): SNItem {
    return CreateItemFromPayload(payload);
  }

  /**
   * Creates an unmanaged payload from any object, where the raw object
   * represents the same data a payload would.
   */
  public createPayloadFromObject(object: any): PurePayload {
    return CreateMaxPayloadFromAnyObject(object);
  }

  /**
   * @returns The date of last sync
   */
  public getLastSyncDate(): Date | undefined {
    return this.syncService.getLastSyncDate();
  }

  public getSyncStatus(): SyncOpStatus {
    return this.syncService.getStatus();
  }

  public getSessions(): Promise<HttpResponse<RemoteSession[]>> {
    return this.sessionManager.getSessionsList();
  }

  public async revokeSession(
    sessionId: UuidString
  ): Promise<HttpResponse | undefined> {
    if (await this.protectionService.authorizeSessionRevoking()) {
      return this.sessionManager.revokeSession(sessionId);
    }
  }

  public async userCanManageSessions(): Promise<boolean> {
    const userVersion = await this.getUserVersion();
    if (isNullOrUndefined(userVersion)) {
      return false;
    }
    return compareVersions(userVersion, ProtocolVersion.V004) >= 0;
  }

  /**
   * @param isUserModified  Whether to change the modified date the user
   * sees of the item.
   */
  public async setItemNeedsSync(
    item: SNItem,
    isUserModified = false
  ): Promise<SNItem | undefined> {
    return this.itemManager.setItemDirty(item.uuid, isUserModified);
  }

  public async setItemsNeedsSync(
    items: SNItem[]
  ): Promise<(SNItem | undefined)[]> {
    return this.itemManager.setItemsDirty(Uuids(items));
  }

  public async deleteItem(item: SNItem): Promise<void> {
    await this.itemManager.setItemToBeDeleted(item.uuid);
    await this.sync();
  }

  public deleteItemLocally(item: SNItem): void {
    this.itemManager.removeItemLocally(item);
  }

  public async emptyTrash(): Promise<void> {
    await this.itemManager.emptyTrash();
    await this.sync();
  }

  public getTrashedItems(): SNNote[] {
    return this.itemManager.trashedItems;
  }

  public setDisplayOptions<T extends SNItem>(
    contentType: ContentType,
    sortBy?: CollectionSort,
    direction?: SortDirection,
    filter?: (element: T) => boolean
  ): void {
    this.itemManager.setDisplayOptions(contentType, sortBy, direction, filter);
  }

  public setNotesDisplayCriteria(criteria: NotesDisplayCriteria): void {
    this.itemManager.setNotesDisplayCriteria(criteria);
  }

  public getDisplayableItems(contentType: ContentType): SNItem[] {
    return this.itemManager.getDisplayableItems(contentType);
  }

  /**
   * Inserts the input item by its payload properties, and marks the item as dirty.
   * A sync is not performed after an item is inserted. This must be handled by the caller.
   */
  public async insertItem(item: SNItem): Promise<SNItem> {
    const mutator = createMutatorForItem(item, MutationType.UserInteraction);
    const dirtiedPayload = mutator.getResult();
    const insertedItem = await this.itemManager.emitItemFromPayload(
      dirtiedPayload
    );
    return insertedItem;
  }

  /**
   * Saves the item by uuid by finding it, setting it as dirty if its not already,
   * and performing a sync request.
   */
  public async saveItem(uuid: UuidString): Promise<void> {
    const item = this.itemManager.findItem(uuid);
    if (!item) {
      throw Error('Attempting to save non-inserted item');
    }
    if (!item.dirty) {
      await this.itemManager.changeItem(uuid, undefined, MutationType.Internal);
    }
    await this.syncService.sync();
  }

  /**
   * Mutates a pre-existing item, marks it as dirty, and syncs it
   */
  public async changeAndSaveItem<M extends ItemMutator = ItemMutator>(
    uuid: UuidString,
    mutate?: (mutator: M) => void,
    isUserModified = true,
    payloadSource?: PayloadSource,
    syncOptions?: SyncOptions
  ): Promise<SNItem | undefined> {
    if (!isString(uuid)) {
      throw Error('Must use uuid to change item');
    }
    await this.itemManager.changeItems(
      [uuid],
      mutate,
      isUserModified ? MutationType.UserInteraction : undefined,
      payloadSource
    );
    await this.syncService.sync(syncOptions);
    return this.findItem(uuid);
  }

  /**
   * Mutates pre-existing items, marks them as dirty, and syncs
   */
  public async changeAndSaveItems<M extends ItemMutator = ItemMutator>(
    uuids: UuidString[],
    mutate?: (mutator: M) => void,
    isUserModified = true,
    payloadSource?: PayloadSource,
    syncOptions?: SyncOptions
  ): Promise<void> {
    await this.itemManager.changeItems(
      uuids,
      mutate,
      isUserModified ? MutationType.UserInteraction : undefined,
      payloadSource
    );
    await this.syncService.sync(syncOptions);
  }

  /**
   * Mutates a pre-existing item and marks it as dirty. Does not sync changes.
   */
  public async changeItem<M extends ItemMutator>(
    uuid: UuidString,
    mutate?: (mutator: M) => void,
    isUserModified = true
  ): Promise<SNItem | undefined> {
    if (!isString(uuid)) {
      throw Error('Must use uuid to change item');
    }
    await this.itemManager.changeItems(
      [uuid],
      mutate,
      isUserModified ? MutationType.UserInteraction : undefined
    );
    return this.findItem(uuid);
  }

  /**
   * Mutates a pre-existing items and marks them as dirty. Does not sync changes.
   */
  public async changeItems<M extends ItemMutator = ItemMutator>(
    uuids: UuidString[],
    mutate?: (mutator: M) => void,
    isUserModified = true
  ): Promise<(SNItem | undefined)[]> {
    return this.itemManager.changeItems(
      uuids,
      mutate,
      isUserModified ? MutationType.UserInteraction : undefined
    );
  }

  public async protectNote(note: SNNote): Promise<SNNote> {
    const protectedNote = await this.protectionService.protectNote(note);
    void this.syncService.sync();
    return protectedNote;
  }

  public async unprotectNote(note: SNNote): Promise<SNNote | undefined> {
    const unprotectedNote = await this.protectionService.unprotectNote(note);
    if (!isNullOrUndefined(unprotectedNote)) {
      void this.syncService.sync();
    }
    return unprotectedNote;
  }

  public async authorizeProtectedActionForNotes(
    notes: SNNote[],
    challengeReason: ChallengeReason
  ): Promise<SNNote[]> {
    return await this.protectionService.authorizeProtectedActionForNotes(
      notes,
      challengeReason
    );
  }

  public async protectNotes(notes: SNNote[]): Promise<SNNote[]> {
    const protectedNotes = await this.protectionService.protectNotes(notes);
    void this.syncService.sync();
    return protectedNotes;
  }

  public async unprotectNotes(notes: SNNote[]): Promise<SNNote[]> {
    const unprotectedNotes = await this.protectionService.unprotectNotes(notes);
    void this.syncService.sync();
    return unprotectedNotes;
  }

  public getItems(contentType: ContentType | ContentType[]): SNItem[] {
    return this.itemManager.getItems(contentType);
  }

  public notesMatchingSmartTag(smartTag: SNSmartTag): SNNote[] {
    return this.itemManager.notesMatchingSmartTag(smartTag);
  }

  /** Returns an item's direct references */
  public referencesForItem(item: SNItem, contentType?: ContentType): SNItem[] {
    let references = this.itemManager.referencesForItem(item.uuid);
    if (contentType) {
      references = references.filter((ref) => {
        return ref?.content_type === contentType;
      });
    }
    return references;
  }

  /** Returns items referencing an item */
  public referencingForItem(item: SNItem, contentType?: ContentType): SNItem[] {
    let references = this.itemManager.itemsReferencingItem(item.uuid);
    if (contentType) {
      references = references.filter((ref) => {
        return ref?.content_type === contentType;
      });
    }
    return references as SNItem[];
  }

  public duplicateItem<T extends SNItem>(
    item: T,
    additionalContent?: Partial<PayloadContent>
  ): Promise<T> {
    const duplicate = this.itemManager.duplicateItem<T>(
      item.uuid,
      false,
      additionalContent
    );
    this.sync();
    return duplicate;
  }

  public findTagByTitle(title: string): SNTag | undefined {
    return this.itemManager.findTagByTitle(title);
  }

  public async findOrCreateTag(title: string): Promise<SNTag> {
    return this.itemManager.findOrCreateTagByTitle(title);
  }

  public getSmartTags(): SNSmartTag[] {
    return this.itemManager.getSmartTags();
  }

  public getNoteCount(): number {
    return this.itemManager.noteCount;
  }

  /**
   * Begin streaming items to display in the UI. The stream callback will be called
   * immediately with the present items that match the constraint, and over time whenever
   * items matching the constraint are added, changed, or deleted.
   */
  public streamItems(
    contentType: ContentType | ContentType[],
    stream: ItemStream
  ): () => void {
    const observer = this.itemManager.addObserver(
      contentType,
      (changed, inserted, discarded, _ignored, source) => {
        const all = changed.concat(inserted).concat(discarded);
        stream(all, source);
      }
    );
    /** Push current values now */
    const matches = this.itemManager.getItems(contentType);
    if (matches.length > 0) {
      stream(matches);
    }
    this.streamRemovers.push(observer);
    return () => {
      observer();
      removeFromArray(this.streamRemovers, observer);
    };
  }

  /**
   * Activates or deactivates a component, depending on its
   * current state, and syncs.
   */
  public async toggleComponent(component: SNComponent): Promise<void> {
    await this.componentManager.toggleComponent(component);
    await this.syncService.sync();
  }

  /**
   * Set the server's URL
   */
  public async setHost(host: string): Promise<void> {
    return this.apiService.setHost(host);
  }

  public getHost(): string | undefined {
    return this.apiService.getHost();
  }

  public getUser(): User | undefined {
    if (!this.launched) {
      throw Error('Attempting to access user before application unlocked');
    }
    return this.sessionManager.getUser();
  }

  public async getProtocolEncryptionDisplayName(): Promise<string | undefined> {
    return this.protocolService.getEncryptionDisplayName();
  }

  public getUserVersion(): Promise<ProtocolVersion | undefined> {
    return this.protocolService.getUserVersion();
  }

  /**
   * Returns true if there is an upgrade available for the account or passcode
   */
  public async protocolUpgradeAvailable(): Promise<boolean> {
    return this.protocolService.upgradeAvailable();
  }

  /**
   * Returns true if there is an encryption source available
   */
  public isEncryptionAvailable(): boolean {
    return this.hasAccount() || this.hasPasscode();
  }

  public async upgradeProtocolVersion(): Promise<{
    success?: true;
    canceled?: true;
    error?: {
      message: string;
    };
  }> {
    const result = await this.credentialService.performProtocolUpgrade();
    if (result.success) {
      if (this.hasAccount()) {
        void this.alertService.alert(ProtocolUpgradeStrings.SuccessAccount);
      } else {
        void this.alertService.alert(
          ProtocolUpgradeStrings.SuccessPasscodeOnly
        );
      }
    } else if (result.error) {
      void this.alertService.alert(ProtocolUpgradeStrings.Fail);
    }
    return result;
  }

  public noAccount(): boolean {
    return !this.hasAccount();
  }

  public hasAccount(): boolean {
    return this.protocolService.hasAccount();
  }

  /**
   * @returns true if the user has a source of protection available, such as a
   * passcode, password, or biometrics.
   */
  public hasProtectionSources(): boolean {
    return this.protectionService.hasProtectionSources();
  }

  public areProtectionsEnabled(): boolean {
    return this.protectionService.areProtectionsEnabled();
  }

  /**
   * When a user specifies a non-zero remember duration on a protection
   * challenge, a session will be started during which protections are disabled.
   */
  public getProtectionSessionExpiryDate(): Date {
    return this.protectionService.getSessionExpiryDate();
  }

  public clearProtectionSession(): Promise<void> {
    return this.protectionService.clearSession();
  }

  /**
   * @returns whether note access has been granted or not
   */
  public authorizeNoteAccess(note: SNNote): Promise<boolean> {
    return this.protectionService.authorizeNoteAccess(note);
  }

  public authorizeAutolockIntervalChange(): Promise<boolean> {
    return this.protectionService.authorizeAutolockIntervalChange();
  }

  public authorizeBatchManagerAccess(): Promise<boolean> {
    return this.protectionService.authorizeBatchManagerAccess();
  }

  public authorizeCloudLinkAccess(): Promise<boolean> {
    return this.protectionService.authorizeCloudLinkAccess();
  }

  public authorizeSearchingProtectedNotesText(): Promise<boolean> {
    return this.protectionService.authorizeSearchingProtectedNotesText();
  }

  /**
   * @returns
   * .affectedItems: Items that were either created or dirtied by this import
   * .errorCount: The number of items that were not imported due to failure to decrypt.
   */
  public async importData(
    data: BackupFile,
    awaitSync = false
  ): Promise<
    | {
        affectedItems: SNItem[];
        errorCount: number;
      }
    | {
        error: string;
      }
    | undefined
  > {
    if (data.version) {
      /**
       * Prior to 003 backup files did not have a version field so we cannot
       * stop importing if there is no backup file version, only if there is
       * an unsupported version.
       */
      const version = data.version as ProtocolVersion;

      const supportedVersions = this.protocolService.supportedVersions();
      if (!supportedVersions.includes(version)) {
        return { error: UNSUPPORTED_BACKUP_FILE_VERSION };
      }

      const userVersion = await this.getUserVersion();
      if (userVersion && compareVersions(version, userVersion) === 1) {
        /** File was made with a greater version than the user's account */
        return { error: BACKUP_FILE_MORE_RECENT_THAN_ACCOUNT };
      }
    }

    let password: string | undefined;

    if (data.auth_params || data.keyParams) {
      /** Get import file password. */
      const challenge = new Challenge(
        [
          new ChallengePrompt(
            ChallengeValidation.None,
            ImportStrings.FileAccountPassword,
            undefined,
            true
          ),
        ],
        ChallengeReason.DecryptEncryptedFile,
        true
      );
      const passwordResponse = await this.challengeService.promptForChallengeResponse(
        challenge
      );
      if (isNullOrUndefined(passwordResponse)) {
        /** Challenge was canceled */
        return;
      }
      this.challengeService.completeChallenge(challenge);
      password = passwordResponse.values[0].value as string;
    }

    if (!(await this.protectionService.authorizeFileImport())) {
      return;
    }
    const decryptedPayloads = await this.protocolService.payloadsByDecryptingBackupFile(
      data,
      password
    );
    const validPayloads = decryptedPayloads
      .filter((payload) => {
        return (
          !payload.errorDecrypting &&
          payload.format !== PayloadFormat.EncryptedString
        );
      })
      .map((payload) => {
        /* Don't want to activate any components during import process in
         * case of exceptions breaking up the import proccess */
        if (
          payload.content_type === ContentType.Component &&
          payload.safeContent.active
        ) {
          return CopyPayload(payload, {
            content: {
              ...payload.safeContent,
              active: false,
            },
          });
        } else {
          return payload;
        }
      });
    const affectedUuids = await this.payloadManager.importPayloads(
      validPayloads
    );
    const promise = this.sync();
    if (awaitSync) {
      await promise;
    }
    const affectedItems = this.getAll(affectedUuids) as SNItem[];
    return {
      affectedItems: affectedItems,
      errorCount: decryptedPayloads.length - validPayloads.length,
    };
  }

  /**
   * Creates a JSON-stringifiable backup object of all items.
   */
  public async createBackupFile(
    intent: EncryptionIntent,
    authorizeEncrypted = false
  ): Promise<BackupFile | undefined> {
    const encrypted = intent === EncryptionIntent.FileEncrypted;
    const decrypted = intent === EncryptionIntent.FileDecrypted;
    const authorize = (encrypted && authorizeEncrypted) || decrypted;

    if (
      authorize &&
      !(await this.protectionService.authorizeBackupCreation(encrypted))
    ) {
      return;
    }

    return this.protocolService.createBackupFile(intent);
  }

  public isEphemeralSession(): boolean {
    return this.storageService.isEphemeralSession();
  }

  public sync(options?: SyncOptions): Promise<any> {
    return this.syncService.sync(options);
  }

  public isOutOfSync(): boolean {
    return this.syncService.isOutOfSync();
  }

  public async resolveOutOfSync(): Promise<void> {
    return this.syncService.resolveOutOfSync();
  }

  public async setValue(
    key: string,
    value: any,
    mode?: StorageValueModes
  ): Promise<void> {
    return this.storageService.setValue(key, value, mode);
  }

  public async getValue(key: string, mode?: StorageValueModes): Promise<any> {
    return this.storageService.getValue(key, mode);
  }

  public async removeValue(
    key: string,
    mode?: StorageValueModes
  ): Promise<void> {
    return this.storageService.removeValue(key, mode);
  }

  public getPreference<K extends PrefKey>(key: K): PrefValue[K] | undefined;
  public getPreference<K extends PrefKey>(
    key: K,
    defaultValue: PrefValue[K]
  ): PrefValue[K];
  public getPreference<K extends PrefKey>(
    key: K,
    defaultValue?: PrefValue[K]
  ): PrefValue[K] | undefined {
    return this.preferencesService.getValue(key, defaultValue);
  }

  public async setPreference<K extends PrefKey>(
    key: K,
    value: PrefValue[K]
  ): Promise<void> {
    return this.preferencesService.setValue(key, value);
  }

  public hasPermission(permission: Permission): boolean {
    return this.permissionsService.hasPermission(permission);
  }

  /**
   * Gives services a chance to complete any sensitive operations before yielding
   * @param maxWait The maximum number of milliseconds to wait for services
   * to finish tasks. 0 means no limit.
   */
  async prepareForDeinit(maxWait = 0): Promise<void> {
    const promise = Promise.all(
      this.services.map((service) => service.blockDeinit())
    );
    if (maxWait === 0) {
      await promise;
    } else {
      /** Await up to maxWait. If not resolved by then, return. */
      await Promise.race([promise, sleep(maxWait)]);
    }
  }

  public promptForCustomChallenge(
    challenge: Challenge
  ): Promise<ChallengeResponse | undefined> {
    return this.challengeService?.promptForChallengeResponse(challenge);
  }

  public addChallengeObserver(
    challenge: Challenge,
    observer: ChallengeObserver
  ): () => void {
    return this.challengeService.addChallengeObserver(challenge, observer);
  }

  public submitValuesForChallenge(
    challenge: Challenge,
    values: ChallengeValue[]
  ): Promise<void> {
    return this.challengeService.submitValuesForChallenge(challenge, values);
  }

  public cancelChallenge(challenge: Challenge): void {
    this.challengeService.cancelChallenge(challenge);
  }

  /** Set a function to be called when this application deinits */
  public setOnDeinit(
    onDeinit: (app: SNApplication, source: DeinitSource) => void
  ): void {
    this.onDeinit = onDeinit;
  }

  /**
   * Destroys the application instance.
   */
  public deinit(source: DeinitSource): void {
    clearInterval(this.autoSyncInterval);
    for (const uninstallObserver of this.serviceObservers) {
      uninstallObserver();
    }
    for (const uninstallSubscriber of this.managedSubscribers) {
      uninstallSubscriber();
    }
    for (const service of this.services) {
      service.deinit();
    }
    this.onDeinit?.(this, source);
    this.onDeinit = undefined;
    (this.crypto as unknown) = undefined;
    this.createdNewDatabase = false;
    this.services.length = 0;
    this.serviceObservers.length = 0;
    this.managedSubscribers.length = 0;
    this.streamRemovers.length = 0;
    this.clearServices();
    this.dealloced = true;
    this.started = false;
  }

  /**
   *  @param mergeLocal  Whether to merge existing offline data into account. If false,
   *                     any pre-existing data will be fully deleted upon success.
   */
  public async register(
    email: string,
    password: string,
    ephemeral = false,
    mergeLocal = true
  ): Promise<AccountServiceResponse> {
    return this.credentialService.register(
      email,
      password,
      ephemeral,
      mergeLocal
    );
  }

  /**
   * @param mergeLocal  Whether to merge existing offline data into account.
   * If false, any pre-existing data will be fully deleted upon success.
   */
  public async signIn(
    email: string,
    password: string,
    strict = false,
    ephemeral = false,
    mergeLocal = true,
    awaitSync = false
  ): Promise<AccountServiceResponse> {
    return this.credentialService.signIn(
      email,
      password,
      strict,
      ephemeral,
      mergeLocal,
      awaitSync
    );
  }

  public async changePassword(
    currentPassword: string,
    newPassword: string,
    passcode?: string,
    origination = KeyParamsOrigination.PasswordChange,
    { validatePasswordStrength = true } = {}
  ): Promise<PasswordChangeFunctionResponse> {
    return this.credentialService.changePassword(
      currentPassword,
      newPassword,
      passcode,
      origination,
      { validatePasswordStrength }
    );
  }

  public async signOut(): Promise<void> {
    await this.credentialService.signOut();
    await this.notifyEvent(ApplicationEvent.SignedOut);
    await this.prepareForDeinit();
    this.deinit(DeinitSource.SignOut);
  }

  public async validateAccountPassword(password: string): Promise<boolean> {
    const { valid } = await this.protocolService.validateAccountPassword(
      password
    );
    return valid;
  }

  public isStarted(): boolean {
    return this.started;
  }

  public isLaunched(): boolean {
    return this.launched;
  }

  public hasBiometrics(): boolean {
    return this.protectionService.hasBiometricsEnabled();
  }

  /**
   * @returns whether the operation was successful or not
   */
  public enableBiometrics(): Promise<boolean> {
    return this.protectionService.enableBiometrics();
  }

  /**
   * @returns whether the operation was successful or not
   */
  public disableBiometrics(): Promise<boolean> {
    return this.protectionService.disableBiometrics();
  }

  public hasPasscode(): boolean {
    return this.protocolService.hasPasscode();
  }

  async isLocked(): Promise<boolean> {
    if (!this.started) {
      return true;
    }
    return this.challengeService.isPasscodeLocked();
  }

  public async lock(): Promise<void> {
    /** Because locking is a critical operation, we want to try to do it safely,
     * but only up to a certain limit. */
    const MaximumWaitTime = 500;
    await this.prepareForDeinit(MaximumWaitTime);
    return this.deinit(DeinitSource.Lock);
  }

  public addPasscode(passcode: string): Promise<boolean> {
    return this.credentialService.addPasscode(passcode);
  }

  /**
   * @returns whether the passcode was successfuly removed
   */
  public async removePasscode(): Promise<boolean> {
    return this.credentialService.removePasscode();
  }

  public async changePasscode(
    newPasscode: string,
    origination = KeyParamsOrigination.PasscodeChange
  ): Promise<boolean> {
    return this.credentialService.changePasscode(newPasscode, origination);
  }

  public getStorageEncryptionPolicy(): StorageEncryptionPolicies {
    return this.storageService.getStorageEncryptionPolicy();
  }

  public async setStorageEncryptionPolicy(
    encryptionPolicy: StorageEncryptionPolicies
  ): Promise<void> {
    await this.storageService.setEncryptionPolicy(encryptionPolicy);
    return this.protocolService.repersistAllItems();
  }

  public enableEphemeralPersistencePolicy(): Promise<void> {
    return this.storageService.setPersistencePolicy(
      StoragePersistencePolicies.Ephemeral
    );
  }

  public hasPendingMigrations(): Promise<boolean> {
    return this.migrationService.hasPendingMigrations();
  }

  public generateUuid(): Promise<string> {
    return Uuid.GenerateUuid();
  }

  public presentKeyRecoveryWizard(): Promise<void> {
    return this.keyRecoveryService.processPersistedUndecryptables();
  }

  /**
   * Dynamically change the device interface, i.e when Desktop wants to override
   * default web interface.
   */
  public changeDeviceInterface(deviceInterface: DeviceInterface): void {
    this.deviceInterface = deviceInterface;
    for (const service of this.services) {
      if (service.deviceInterface) {
        service.deviceInterface = deviceInterface;
      }
    }
  }

  private constructServices() {
    this.createPermissionsService();
    this.createPayloadManager();
    this.createItemManager();
    this.createStorageManager();
    this.createProtocolService();
    const encryptionDelegate = {
      payloadByEncryptingPayload: this.protocolService.payloadByEncryptingPayload.bind(
        this.protocolService
      ),
      payloadByDecryptingPayload: this.protocolService.payloadByDecryptingPayload.bind(
        this.protocolService
      ),
    };
    this.storageService.encryptionDelegate = encryptionDelegate;
    this.createChallengeService();
    this.createHttpManager();
    this.createMfaService();
    this.createApiService();
    this.createSessionManager();
    this.createMigrationService();
    this.createHistoryManager();
    this.createSyncManager();
    this.createProtectionService();
    this.createCredentialService();
    this.createKeyRecoveryService();
    this.createSingletonManager();
    this.createComponentManager();
    this.createActionsManager();
    this.createPreferencesService();
  }

  private clearServices() {
    (this.migrationService as unknown) = undefined;
    (this.alertService as unknown) = undefined;
    (this.httpService as unknown) = undefined;
    (this.payloadManager as unknown) = undefined;
    (this.protocolService as unknown) = undefined;
    (this.storageService as unknown) = undefined;
    (this.apiService as unknown) = undefined;
    (this.sessionManager as unknown) = undefined;
    (this.syncService as unknown) = undefined;
    (this.challengeService as unknown) = undefined;
    (this.singletonManager as unknown) = undefined;
    (this.componentManager as unknown) = undefined;
    (this.protectionService as unknown) = undefined;
    (this.actionsManager as unknown) = undefined;
    (this.historyManager as unknown) = undefined;
    (this.itemManager as unknown) = undefined;
    (this.keyRecoveryService as unknown) = undefined;
    (this.preferencesService as unknown) = undefined;
    (this.permissionsService as unknown) = undefined;
    (this.credentialService as unknown) = undefined;
    (this.mfaService as unknown) = undefined;

    this.services = [];
  }

  private createPermissionsService() {
    this.permissionsService = new SNPermissionsService();
    this.serviceObservers.push(
      this.permissionsService.addEventObserver((_event, permissions) => {
        void this.notifyEvent(ApplicationEvent.PermissionsChanged, permissions);
      })
    );
    this.services.push(this.permissionsService);
  }

  private createMigrationService() {
    this.migrationService = new SNMigrationService({
      protocolService: this.protocolService,
      deviceInterface: this.deviceInterface,
      storageService: this.storageService,
      sessionManager: this.sessionManager,
      challengeService: this.challengeService,
      itemManager: this.itemManager,
      environment: this.environment,
      identifier: this.identifier,
    });
    this.services.push(this.migrationService);
  }

  private createCredentialService(): void {
    this.credentialService = new SNCredentialService(
      this.sessionManager,
      this.syncService,
      this.storageService,
      this.itemManager,
      this.protocolService,
      this.alertService,
      this.challengeService,
      this.protectionService
    );
    this.services.push(this.credentialService);
  }

  private createApiService() {
    this.apiService = new SNApiService(
      this.httpService,
      this.storageService,
      this.permissionsService,
      this.defaultHost,
      this.mfaService,
      this.alertService,
    );
    this.services.push(this.apiService);
  }

  private createItemManager() {
    this.itemManager = new ItemManager(this.payloadManager);
    this.services.push(this.itemManager);
  }

  private createComponentManager() {
    const MaybeSwappedComponentManager = this.getClass<
      typeof SNComponentManager
    >(SNComponentManager);
    this.componentManager = new MaybeSwappedComponentManager(
      this.itemManager,
      this.syncService,
      this.alertService,
      this.environment,
      this.platform,
      this.deviceInterface.timeout
    );
    this.services.push(this.componentManager);
  }

  private createHttpManager() {
    this.httpService = new SNHttpService();
    this.services.push(this.httpService);
  }

  private createPayloadManager() {
    this.payloadManager = new PayloadManager();
    this.services.push(this.payloadManager);
  }

  private createSingletonManager() {
    this.singletonManager = new SNSingletonManager(
      this.itemManager,
      this.syncService
    );
    this.services.push(this.singletonManager);
  }

  private createStorageManager() {
    this.storageService = new SNStorageService(
      this.deviceInterface,
      this.alertService,
      this.identifier,
      this.environment
    );
    this.services.push(this.storageService);
  }

  private createProtocolService() {
    this.protocolService = new SNProtocolService(
      this.itemManager,
      this.payloadManager,
      this.deviceInterface,
      this.storageService,
      this.identifier,
      this.crypto
    );
    this.protocolService.onKeyStatusChange(async () => {
      await this.notifyEvent(ApplicationEvent.KeyStatusChanged);
    });
    this.services.push(this.protocolService);
  }

  private createKeyRecoveryService() {
    this.keyRecoveryService = new SNKeyRecoveryService(
      this.itemManager,
      this.payloadManager,
      this.apiService,
      this.protocolService,
      this.challengeService,
      this.alertService,
      this.storageService,
      this.syncService,
      this.credentialService
    );
    this.services.push(this.keyRecoveryService);
  }

  private createSessionManager() {
    this.sessionManager = new SNSessionManager(
      this.storageService,
      this.apiService,
      this.alertService,
      this.protocolService,
      this.challengeService,
    );
    this.serviceObservers.push(
      this.sessionManager.addEventObserver(async (event) => {
        switch (event) {
          case SessionEvent.Restored: {
            void (async () => {
              await this.sync();
              if (this.protocolService.needsNewRootKeyBasedItemsKey()) {
                void this.protocolService.createNewDefaultItemsKey();
              }
            })();
            break;
          }
          case SessionEvent.Revoked: {
            /** Keep a reference to the soon-to-be-cleared alertService */
            const alertService = this.alertService;
            await this.signOut();
            void alertService.alert(SessionStrings.CurrentSessionRevoked);
            break;
          }
          default: {
            assertUnreachable(event);
          }
        }
      })
    );
    this.services.push(this.sessionManager);
  }

  private createSyncManager() {
    this.syncService = new SNSyncService(
      this.itemManager,
      this.sessionManager,
      this.protocolService,
      this.storageService,
      this.payloadManager,
      this.apiService,
      this.historyManager,
      this.deviceInterface.interval
    );
    const syncEventCallback = async (eventName: SyncEvent) => {
      const appEvent = applicationEventForSyncEvent(eventName);
      if (appEvent) {
        await this.notifyEvent(appEvent);
      }
      await this.protocolService.onSyncEvent(eventName);
    };
    const uninstall = this.syncService.addEventObserver(syncEventCallback);
    this.serviceObservers.push(uninstall);
    this.services.push(this.syncService);
  }

  private createChallengeService() {
    this.challengeService = new ChallengeService(
      this.storageService,
      this.protocolService
    );
    this.services.push(this.challengeService);
  }

  private createProtectionService() {
    this.protectionService = new SNProtectionService(
      this.protocolService,
      this.challengeService,
      this.storageService,
      this.itemManager
    );
    this.serviceObservers.push(
      this.protectionService.addEventObserver((event) => {
        if (event === ProtectionEvent.SessionExpiryDateChanged) {
          void this.notifyEvent(
            ApplicationEvent.ProtectionSessionExpiryDateChanged
          );
        }
      })
    );
    this.services.push(this.protectionService);
  }

  private createHistoryManager() {
    this.historyManager = new SNHistoryManager(
      this.itemManager,
      this.storageService,
      this.apiService,
      this.protocolService,
      this.deviceInterface
    );
    this.services.push(this.historyManager);
  }

  private createActionsManager() {
    this.actionsManager = new SNActionsService(
      this.itemManager,
      this.alertService,
      this.deviceInterface,
      this.httpService,
      this.payloadManager,
      this.protocolService,
      this.syncService
    );
    this.serviceObservers.push(
      this.credentialService.addEventObserver((event) => {
        switch (event) {
          case AccountEvent.SignedInOrRegistered: {
            void this.notifyEvent(ApplicationEvent.SignedIn);
            break;
          }
          default: {
            assertUnreachable(event);
          }
        }
      })
    );
    this.services.push(this.actionsManager);
  }

  private createPreferencesService() {
    this.preferencesService = new SNPreferencesService(
      this.singletonManager,
      this.itemManager,
      this.syncService
    );
    this.serviceObservers.push(
      this.preferencesService.addEventObserver(() => {
        void this.notifyEvent(ApplicationEvent.PreferencesChanged);
      })
    );
    this.services.push(this.preferencesService);
  }

  private createMfaService() {
    this.mfaService = new SNMfaService(this.challengeService);
    this.services.push(this.mfaService);
  }

  private getClass<T>(base: T) {
    const swapClass = this.swapClasses.find(
      (candidate) => candidate.swap === base
    );
    if (swapClass) {
      return swapClass.with as T;
    } else {
      return base;
    }
  }
}
