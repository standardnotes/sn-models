import { SNKeyRecoveryService } from './services/key_recovery_service';
import { CollectionSort, SortDirection } from '@Protocol/collection/item_collection';
import { Uuids } from '@Models/functions';
import { PayloadOverride } from './protocol/payloads/generator';
import { ApplicationStage } from '@Lib/stages';
import { UuidString, ApplicationIdentifier, DeinitSource } from './types';
import { SyncEvent, ApplicationEvent, applicationEventForSyncEvent } from '@Lib/events';
import { StorageEncryptionPolicies } from './services/storage_service';
import { Uuid } from '@Lib/uuid';
import { BackupFile } from './services/protocol_service';
import { EncryptionIntent } from '@Protocol/intents';
import { SyncOptions } from './services/sync/sync_service';
import { SNSmartTag } from './models/app/smartTag';
import { SNItem, ItemMutator, MutationType } from '@Models/core/item';
import { SNPredicate } from '@Models/core/predicate';
import { PurePayload } from '@Payloads/pure_payload';
import { Challenge, ChallengeResponse, ChallengeValidation, ChallengeReason, ChallengeValue, ChallengePrompt } from './challenges';
import { ChallengeObserver } from './services/challenge/challenge_service';
import { PureService } from '@Lib/services/pure_service';
import { SNPureCrypto } from '@standardnotes/sncrypto';
import { Environment, Platform } from './platforms';
import { removeFromArray, isString, sleep } from '@Lib/utils';
import { ContentType } from '@Models/content_types';
import { CopyPayload, PayloadContent, CreateMaxPayloadFromAnyObject } from '@Payloads/generator';
import { PayloadSource } from '@Payloads/sources';
import { CreateItemFromPayload } from '@Models/generator';
import { StoragePersistencePolicies, StorageValueModes } from '@Services/storage_service';
import {
  SNMigrationService,
  SNActionsService,
  SNApiService,
  PayloadManager,
  SNProtocolService,
  SNPrivilegesService,
  SNHistoryManager,
  SNAlertService,
  SNSessionManager,
  SNComponentManager,
  SNHttpService,
  SNSingletonManager,
  SNStorageService,
  SNSyncService,
  ChallengeService,
  SyncModes,
  ItemManager
} from './services';
import { DeviceInterface } from './device_interface';
import {
  PasswordChangeStrings,
  InsufficientPasswordMessage,
  UPGRADING_ENCRYPTION,
  SETTING_PASSCODE,
  REMOVING_PASSCODE,
  CHANGING_PASSCODE,
  BACKUP_FILE_MORE_RECENT_THAN_ACCOUNT,
  DO_NOT_CLOSE_APPLICATION,
  UNSUPPORTED_BACKUP_FILE_VERSION, ChallengeStrings, ProtocolUpgradeStrings, INVALID_PASSWORD, SessionStrings, ErrorAlertStrings
} from './services/api/messages';
import { MINIMUM_PASSWORD_LENGTH, MissingAccountParams, SessionEvent } from './services/api/session_manager';
import { SNComponent, SNTag, SNNote } from './models';
import { ProtocolVersion, compareVersions } from './protocol/versions';
import { KeyParamsOrigination } from './protocol/key_params';
import { SNLog } from './log';

/** How often to automatically sync, in milliseconds */
const DEFAULT_AUTO_SYNC_INTERVAL = 30000;

type LaunchCallback = {
  receiveChallenge: (challenge: Challenge) => void
}
type ApplicationEventCallback = (
  event: ApplicationEvent,
  data?: any
) => Promise<void>;
type ApplicationObserver = {
  singleEvent?: ApplicationEvent
  callback: ApplicationEventCallback
}
type ItemStream = (
  items: SNItem[],
  source?: PayloadSource,
) => void
type ObserverRemover = () => void

/** The main entrypoint of an application. */
export class SNApplication {

  public environment: Environment
  public platform: Platform
  public identifier: ApplicationIdentifier
  private swapClasses?: any[]
  private skipClasses?: any[]
  private defaultHost?: string
  private onDeinit?: (app: SNApplication, source: DeinitSource) => void

  private crypto?: SNPureCrypto
  public deviceInterface?: DeviceInterface

  private migrationService!: SNMigrationService
  public alertService!: SNAlertService
  private httpService!: SNHttpService
  private modelManager!: PayloadManager
  public protocolService!: SNProtocolService
  private storageService!: SNStorageService
  private apiService!: SNApiService
  private sessionManager!: SNSessionManager
  private syncService!: SNSyncService
  private challengeService!: ChallengeService
  public singletonManager!: SNSingletonManager
  public componentManager!: SNComponentManager
  public privilegesService!: SNPrivilegesService
  public actionsManager!: SNActionsService
  public historyManager!: SNHistoryManager
  private itemManager!: ItemManager
  private keyRecoveryService!: SNKeyRecoveryService

  private eventHandlers: ApplicationObserver[] = [];
  private services: PureService<any>[] = [];
  private streamRemovers: ObserverRemover[] = [];
  private serviceObservers: ObserverRemover[] = [];
  private managedSubscribers: ObserverRemover[] = [];
  private autoSyncInterval: any

  /** True if the result of deviceInterface.openDatabase yields a new database being created */
  private createdNewDatabase = false
  /** True if the application has started (but not necessarily launched) */
  private started = false
  /** True if the application has launched */
  private launched = false
  /** Whether the application has been destroyed via .deinit() */
  private dealloced = false
  private signingIn = false;
  private registering = false;

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
    environment: Environment,
    platform: Platform,
    deviceInterface: DeviceInterface,
    crypto: SNPureCrypto,
    alertService: SNAlertService,
    identifier: ApplicationIdentifier,
    swapClasses?: { swap: any, with: any }[],
    skipClasses?: any[],
    defaultHost?: string
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
      throw Error('AlertService must be supplied when creating an application.');
    }
    this.environment = environment;
    this.platform = platform;
    this.identifier = identifier;
    this.deviceInterface = deviceInterface;
    this.crypto = crypto;
    this.alertService = alertService;
    this.swapClasses = swapClasses;
    this.skipClasses = skipClasses;
    this.defaultHost = defaultHost;
    this.constructServices();
  }

  /**
   * The first thing consumers should call when starting their app.
   * This function will load all services in their correct order.
   */
  async prepareForLaunch(callback: LaunchCallback) {
    this.setLaunchCallback(callback);
    const databaseResult = await this.deviceInterface!.openDatabase(this.identifier)
      .catch((error) => {
        this.notifyEvent(ApplicationEvent.LocalDatabaseReadError, error);
        return undefined;
      });
    this.createdNewDatabase = databaseResult?.isNewDatabase || false;
    await this.migrationService!.initialize();
    await this.notifyEvent(ApplicationEvent.MigrationsLoaded);
    await this.handleStage(ApplicationStage.PreparingForLaunch_0);
    await this.storageService!.initializeFromDisk();
    await this.notifyEvent(ApplicationEvent.StorageReady);
    await this.protocolService!.initialize();
    await this.handleStage(ApplicationStage.ReadyForLaunch_05);
    this.started = true;
    await this.notifyEvent(ApplicationEvent.Started);
  }

  private setLaunchCallback(callback: LaunchCallback) {
    this.challengeService!.sendChallenge = callback.receiveChallenge;
  }

  /**
   * Handles device authentication, unlocks application, and
   * issues a callback if a device activation requires user input
   * (i.e local passcode or fingerprint).
   * @param awaitDatabaseLoad
   * Option to await database load before marking the app as ready.
   */
  public async launch(awaitDatabaseLoad = false) {
    this.launched = false;
    const launchChallenge = await this.challengeService!.getLaunchChallenge();
    if (launchChallenge) {
      const response = await this.challengeService!.promptForChallengeResponse(launchChallenge);
      if (!response) {
        throw Error('Launch challenge was cancelled.');
      }
      await this.handleLaunchChallengeResponse(response);
    }
    if (this.storageService!.isStorageWrapped()) {
      try {
        await this.storageService!.decryptStorage();
      } catch (_error) {
        this.alertService.alert(
          ErrorAlertStrings.StorageDecryptErrorBody,
          ErrorAlertStrings.StorageDecryptErrorTitle,
        );
      }
    }
    await this.handleStage(ApplicationStage.StorageDecrypted_09);
    await this.apiService!.loadHost();
    await this.sessionManager.initializeFromDisk();
    this.historyManager!.initializeFromDisk();

    this.launched = true;
    await this.notifyEvent(ApplicationEvent.Launched);
    await this.handleStage(ApplicationStage.Launched_10);

    const databasePayloads = await this.syncService!.getDatabasePayloads();
    await this.handleStage(ApplicationStage.LoadingDatabase_11);

    if (this.createdNewDatabase) {
      await this.syncService!.onNewDatabaseCreated();
    }
    /**
    * We don't want to await this, as we want to begin allowing the app to function
    * before local data has been loaded fully. We await only initial
    * `getDatabasePayloads` to lock in on database state.
    */
    const loadPromise = this.syncService!.loadDatabasePayloads(databasePayloads)
      .then(async () => {
        if (this.dealloced) {
          throw 'Application has been destroyed.';
        }
        await this.handleStage(ApplicationStage.LoadedDatabase_12);
        this.beginAutoSyncTimer();
        return this.syncService!.sync({
          mode: SyncModes.DownloadFirst
        });
      });
    if (awaitDatabaseLoad) {
      await loadPromise;
    }
  }

  public onStart() {

  }

  public onLaunch() {

  }

  private async handleLaunchChallengeResponse(response: ChallengeResponse) {
    if (response.challenge.hasPromptForValidationType(ChallengeValidation.LocalPasscode)) {
      let wrappingKey = response.artifacts!.wrappingKey;
      if (!wrappingKey) {
        const value = response.getValueForType(ChallengeValidation.LocalPasscode);
        wrappingKey = await this.protocolService!.computeWrappingKey(value.value as string);
      }
      await this.protocolService!.unwrapRootKey(wrappingKey);
    }
  }

  private beginAutoSyncTimer() {
    this.autoSyncInterval = this.deviceInterface!.interval(() => {
      this.syncService!.log('Syncing from autosync');
      this.sync();
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
  ) {
    const observer = { callback, singleEvent };
    this.eventHandlers.push(observer);
    return () => {
      removeFromArray(this.eventHandlers, observer);
    };
  }

  public addSingleEventObserver(
    event: ApplicationEvent,
    callback: ApplicationEventCallback
  ) {
    const filteredCallback = async (firedEvent: ApplicationEvent) => {
      if (firedEvent === event) {
        callback(event);
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
    this.migrationService!.handleApplicationEvent(event);
  }

  /**
   * Whether the local database has completed loading local items.
   */
  public isDatabaseLoaded() {
    return this.syncService!.isDatabaseLoaded();
  }

  public async savePayload(payload: PurePayload) {
    const dirtied = CopyPayload(
      payload,
      {
        dirty: true,
        dirtiedDate: new Date()
      }
    );
    await this.modelManager!.emitPayload(
      dirtied,
      PayloadSource.LocalChanged
    );
    await this.syncService!.sync();
  }

  /**
   * Finds an item by UUID.
   */
  public findItem(uuid: string) {
    return this.itemManager!.findItem(uuid);
  }

  /**
   * Returns all items.
   */
  public allItems() {
    return this.itemManager!.items;
  }

  /**
   * Finds an item by predicate.
  */
  public findItems(predicate: SNPredicate) {
    return this.itemManager!.itemsMatchingPredicate(predicate);
  }

  /**
   * Finds an item by predicate.
   */
  public getAll(uuids: UuidString[]) {
    return this.itemManager!.findItems(uuids);
  }


  /**
   * Takes the values of the input item and emits it onto global state.
   */
  public async mergeItem(item: SNItem, source: PayloadSource) {
    return this.itemManager!.emitItemFromPayload(item.payloadRepresentation(), source);
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
  ) {
    const item = await this.itemManager!.createItem(
      contentType,
      content,
      needsSync,
      override
    );
    return item;
  }

  /**
   * Creates an unmanaged item that can be added later.
   * @param needsSync  Whether to mark the item as needing sync. `add` must also be true.
   */
  public async createTemplateItem(
    contentType: ContentType,
    content?: PayloadContent
  ) {
    const item = await this.itemManager!.createTemplateItem(
      contentType,
      content,
    );
    return item;
  }

  /**
   * Creates an unmanaged item from a payload.
   */
  public createItemFromPayload(payload: PurePayload) {
    return CreateItemFromPayload(payload);
  }

  /**
   * Creates an unmanaged payload from any object, where the raw object
   * represents the same data a payload would.
   */
  public createPayloadFromObject(object: any) {
    return CreateMaxPayloadFromAnyObject(object);
  }

  /**
   * @returns The date of last sync
   */
  public getLastSyncDate() {
    return this.syncService!.getLastSyncDate();
  }

  public getSyncStatus() {
    return this.syncService!.getStatus()!;
  }

  /**
   * @param isUserModified  Whether to change the modified date the user
   * sees of the item.
   */
  public async setItemNeedsSync(item: SNItem, isUserModified = false) {
    return this.itemManager!.setItemDirty(item.uuid, isUserModified);
  }

  public async setItemsNeedsSync(items: SNItem[]) {
    return this.itemManager!.setItemsDirty(Uuids(items));
  }

  public async deleteItem(item: SNItem) {
    await this.itemManager!.setItemToBeDeleted(item.uuid);
    return this.sync();
  }

  public async deleteItemLocally(item: SNItem) {
    this.itemManager!.removeItemLocally(item);
  }

  public async emptyTrash() {
    await this.itemManager!.emptyTrash();
    return this.sync();
  }

  public getTrashedItems() {
    return this.itemManager!.trashedItems;
  }

  public setDisplayOptions<T extends SNItem>(
    contentType: ContentType,
    sortBy?: CollectionSort,
    direction?: SortDirection,
    filter?: (element: T) => boolean
  ) {
    this.itemManager!.setDisplayOptions(contentType, sortBy, direction, filter);
  }

  public setNotesDisplayOptions(
    tag?: SNTag,
    sortBy?: CollectionSort,
    direction?: SortDirection,
    filter?: (element: SNNote) => boolean
  ) {
    this.itemManager!.setNotesDisplayOptions(tag, sortBy, direction, filter);
  }

  public getDisplayableItems(contentType: ContentType) {
    return this.itemManager!.getDisplayableItems(contentType);
  }

  /**
   * Inserts the input item by its payload properties, and marks the item as dirty.
   * A sync is not performed after an item is inserted. This must be handled by the caller.
   */
  public async insertItem(item: SNItem) {
    /* First insert the item */
    const insertedItem = await this.itemManager!.insertItem(item);
    /* Now change the item so that it's marked as dirty */
    await this.itemManager!.changeItems([insertedItem.uuid]);
    return this.findItem(item.uuid)!;
  }

  /**
   * Saves the item by uuid by finding it, setting it as dirty if its not already,
   * and performing a sync request.
   */
  public async saveItem(uuid: UuidString) {
    const item = this.itemManager!.findItem(uuid);
    if (!item) {
      throw Error('Attempting to save non-inserted item');
    }
    if (!item.dirty) {
      await this.itemManager!.changeItem(uuid);
    }
    await this.syncService!.sync();
  }

  /**
   * Mutates a pre-existing item, marks it as dirty, and syncs it
   */
  public async changeAndSaveItem<M extends ItemMutator = ItemMutator>(
    uuid: UuidString,
    mutate?: (mutator: M) => void,
    isUserModified = false,
    payloadSource?: PayloadSource,
    syncOptions?: SyncOptions
  ) {
    if (!isString(uuid)) {
      throw Error('Must use uuid to change item');
    }
    await this.itemManager!.changeItems(
      [uuid],
      mutate,
      isUserModified ? MutationType.UserInteraction : undefined,
      payloadSource
    );
    await this.syncService!.sync(syncOptions);
    return this.findItem(uuid);
  }

  /**
  * Mutates pre-existing items, marks them as dirty, and syncs
  */
  public async changeAndSaveItems<M extends ItemMutator = ItemMutator>(
    uuids: UuidString[],
    mutate?: (mutator: M) => void,
    isUserModified = false,
    payloadSource?: PayloadSource,
    syncOptions?: SyncOptions
  ) {
    await this.itemManager!.changeItems(
      uuids,
      mutate,
      isUserModified ? MutationType.UserInteraction : undefined,
      payloadSource
    );
    await this.syncService!.sync(syncOptions);
  }

  /**
  * Mutates a pre-existing item and marks it as dirty. Does not sync changes.
  */
  public async changeItem<M extends ItemMutator>(
    uuid: UuidString,
    mutate?: (mutator: M) => void,
    isUserModified = false
  ) {
    if (!isString(uuid)) {
      throw Error('Must use uuid to change item');
    }
    await this.itemManager!.changeItems(
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
    isUserModified = false
  ) {
    return this.itemManager!.changeItems(
      uuids,
      mutate,
      isUserModified ? MutationType.UserInteraction : undefined
    );
  }

  public getItems(contentType: ContentType | ContentType[]) {
    return this.itemManager!.getItems(contentType);
  }

  public notesMatchingSmartTag(smartTag: SNSmartTag) {
    return this.itemManager!.notesMatchingSmartTag(smartTag);
  }

  /** Returns an item's direct references */
  public referencesForItem(item: SNItem, contentType?: ContentType) {
    let references = this.itemManager!.referencesForItem(item.uuid);
    if (contentType) {
      references = references.filter((ref) => {
        return ref?.content_type === contentType;
      })
    }
    return references;
  }

  /** Returns items referencing an item */
  public referencingForItem(item: SNItem, contentType?: ContentType) {
    let references = this.itemManager!.itemsReferencingItem(item.uuid);
    if (contentType) {
      references = references.filter((ref) => {
        return ref?.content_type === contentType;
      })
    }
    return references as SNItem[];
  }

  public duplicateItem<T extends SNItem>(
    item: T,
    additionalContent?: Partial<PayloadContent>
  ) {
    const duplicate = this.itemManager.duplicateItem<T>(
      item.uuid,
      false,
      additionalContent
    );
    this.sync();
    return duplicate;
  }

  public findTagByTitle(title: string) {
    return this.itemManager!.findTagByTitle(title);
  }

  public async findOrCreateTag(title: string) {
    return this.itemManager!.findOrCreateTagByTitle(title);
  }

  public getSmartTags() {
    return this.itemManager!.getSmartTags();
  }

  public getNoteCount() {
    return this.itemManager!.noteCount;
  }


  /**
   * Begin streaming items to display in the UI. The stream callback will be called
   * immediately with the present items that match the constraint, and over time whenever
   * items matching the constraint are added, changed, or deleted.
   */
  public streamItems(
    contentType: ContentType | ContentType[],
    stream: ItemStream
  ) {
    const observer = this.itemManager!.addObserver(
      contentType,
      (changed, inserted, discarded, _ignored, source) => {
        const all = changed.concat(inserted).concat(discarded);
        stream(all, source);
      }
    );
    /** Push current values now */
    const matches = this.itemManager!.getItems(contentType);
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
  public async toggleComponent(component: SNComponent) {
    await this.componentManager!.toggleComponent(component)
    return this.syncService!.sync();
  }

  /**
   * Set the server's URL
   */
  public async setHost(host: string) {
    return this.apiService!.setHost(host);
  }

  public async getHost() {
    return this.apiService!.getHost();
  }

  public getUser() {
    if (!this.launched) {
      throw 'Attempting to access user before application unlocked';
    }
    return this.sessionManager.getUser();
  }

  public async getProtocolEncryptionDisplayName() {
    return this.protocolService!.getEncryptionDisplayName();
  }

  public getUserVersion() {
    return this.protocolService!.getUserVersion();
  }

  /**
   * Returns true if there is an upgrade available for the account or passcode
   */
  public async protocolUpgradeAvailable() {
    return this.protocolService!.upgradeAvailable();
  }

  /**
   * Returns true if there is an encryption source available
   */
  public isEncryptionAvailable() {
    return this.hasAccount() || this.hasPasscode();
  }

  private async performProtocolUpgrade(): Promise<{
    success?: true,
    canceled?: true,
    error?: { message: string }
  }> {
    const hasPasscode = this.hasPasscode();
    const hasAccount = this.hasAccount();
    const prompts = [];
    if (hasPasscode) {
      prompts.push(new ChallengePrompt(
        ChallengeValidation.LocalPasscode,
        undefined,
        ChallengeStrings.LocalPasscodePlaceholder
      ));
    }
    if (hasAccount) {
      prompts.push(new ChallengePrompt(
        ChallengeValidation.AccountPassword,
        undefined,
        ChallengeStrings.AccountPasswordPlaceholder
      ));
    }
    const challenge = new Challenge(prompts, ChallengeReason.ProtocolUpgrade, true);
    const response = await this.challengeService!.promptForChallengeResponse(challenge);
    if (!response) {
      return { canceled: true };
    }
    const dismissBlockingDialog = await this.alertService!.blockingDialog(
      DO_NOT_CLOSE_APPLICATION,
      UPGRADING_ENCRYPTION
    );
    try {
      let passcode: string | undefined;
      if (hasPasscode) {
        /* Upgrade passcode version */
        const value = response.getValueForType(ChallengeValidation.LocalPasscode);
        passcode = value.value as string;
      }
      if (hasAccount) {
        /* Upgrade account version */
        const value = response.getValueForType(ChallengeValidation.AccountPassword);
        const password = value.value as string;
        const changeResponse = await this.changePassword(
          password,
          password,
          passcode,
          KeyParamsOrigination.ProtocolUpgrade,
          { validatePasswordStrength: false }
        );
        if (changeResponse?.error) {
          return { error: changeResponse.error };
        }
      }
      if (hasPasscode) {
        /* Upgrade passcode version */
        await this.changePasscode(passcode!, KeyParamsOrigination.ProtocolUpgrade);
      }
      return { success: true };
    } catch (error) {
      return { error };
    } finally {
      dismissBlockingDialog();
    }
  }

  public async upgradeProtocolVersion() {
    const result = await this.performProtocolUpgrade();
    if (result.success) {
      if (this.hasAccount()) {
        this.alertService!.alert(ProtocolUpgradeStrings.SuccessAccount);
      } else {
        this.alertService!.alert(ProtocolUpgradeStrings.SuccessPasscodeOnly);
      }
    } else if (result.error) {
      this.alertService!.alert(ProtocolUpgradeStrings.Fail);
    }
    return result;
  }

  public noAccount() {
    return !this.hasAccount();
  }

  public hasAccount() {
    return this.protocolService!.hasAccount();
  }

  /**
   * @returns
   * .affectedItems: Items that were either created or dirtied by this import
   * .errorCount: The number of items that were not imported due to failure to decrypt.
   */
  public async importData(
    data: BackupFile,
    password?: string,
    awaitSync = false
  ): Promise<{
    affectedItems: SNItem[];
    errorCount: number;
  } | {
    error: string
  }> {
    if (data.version) {
      /**
       * Prior to 003 backup files did not have a version field so we cannot
       * stop importing if there is no backup file version, only if there is
       * an unsupported version.
       */
      const version = data.version as ProtocolVersion;

      const supportedVersions = this.protocolService!.supportedVersions();
      if (!supportedVersions.includes(version)) {
        return { error: UNSUPPORTED_BACKUP_FILE_VERSION };
      }

      const userVersion = await this.getUserVersion();
      if (userVersion && compareVersions(version, userVersion) === 1) {
        /** File was made with a greater version than the user's account */
        return { error: BACKUP_FILE_MORE_RECENT_THAN_ACCOUNT };
      }
    }
    const decryptedPayloads = await this.protocolService!.payloadsByDecryptingBackupFile(
      data,
      password
    );
    const validPayloads = decryptedPayloads.filter((payload) => {
      return !payload.errorDecrypting;
    }).map((payload) => {
      /* Don't want to activate any components during import process in
       * case of exceptions breaking up the import proccess */
      if (payload.content_type === ContentType.Component && payload.safeContent.active) {
        return CopyPayload(
          payload,
          {
            content: {
              ...payload.safeContent,
              active: false
            }
          }
        )
      } else {
        return payload;
      }
    });
    const affectedUuids = await this.modelManager!.importPayloads(validPayloads);
    const promise = this.sync();
    if (awaitSync) {
      await promise;
    }
    const affectedItems = this.getAll(affectedUuids) as SNItem[];
    return {
      affectedItems: affectedItems,
      errorCount: decryptedPayloads.length - validPayloads.length
    };
  }

  /**
   * Creates a JSON string representing the backup format of all items, or just subItems
   * if supplied.
   */
  public async createBackupFile(
    subItems?: SNItem[],
    intent?: EncryptionIntent,
    returnIfEmpty = false
  ) {
    return this.protocolService!.createBackupFile(
      subItems,
      intent,
      returnIfEmpty
    );
  }

  public isEphemeralSession() {
    return this.storageService!.isEphemeralSession();
  }

  private lockSyncing() {
    this.syncService!.lockSyncing();
  }

  private unlockSyncing() {
    this.syncService!.unlockSyncing();
  }

  public async sync(options?: SyncOptions) {
    return this.syncService!.sync(options);
  }

  public async isOutOfSync() {
    return this.syncService!.isOutOfSync();
  }

  public async resolveOutOfSync() {
    return this.syncService!.resolveOutOfSync();
  }

  public async setValue(key: string, value: any, mode?: StorageValueModes) {
    return this.storageService!.setValue(key, value, mode);
  }

  public async getValue(key: string, mode?: StorageValueModes) {
    return this.storageService!.getValue(key, mode);
  }

  public async removeValue(key: string, mode?: StorageValueModes) {
    return this.storageService!.removeValue(key, mode);
  }

  /**
   * Deletes all payloads from storage.
   */
  public async clearDatabase() {
    return this.storageService!.clearAllPayloads();
  }

  /**
   * Allows items keys to be rewritten to local db on local credential status change,
   * such as if passcode is added, changed, or removed.
   * This allows IndexedDB unencrypted logs to be deleted
   * `deletePayloads` will remove data from backing store,
   * but not from working memory See:
   * https://github.com/standardnotes/desktop/issues/131
   */
  private async rewriteItemsKeys() {
    const itemsKeys = this.itemManager!.itemsKeys();
    const payloads = itemsKeys.map((key) => key.payloadRepresentation());
    await this.storageService!.deletePayloads(payloads);
    await this.syncService!.persistPayloads(payloads);
  }

  /**
   * Gives services a chance to complete any sensitive operations before yielding
   * @param maxWait The maximum number of milliseconds to wait for services
   * to finish tasks. 0 means no limit.
   */
  async prepareForDeinit(maxWait = 0) {
    const promise = Promise.all(this.services.map((service) => service.blockDeinit()));
    if (maxWait === 0) {
      await promise;
    } else {
      /** Await up to maxWait. If not resolved by then, return. */
      await Promise.race([
        promise,
        sleep(maxWait)
      ])
    }
  }

  public promptForCustomChallenge(challenge: Challenge) {
    return this.challengeService?.promptForChallengeResponse(challenge);
  }

  public addChallengeObserver(
    challenge: Challenge,
    observer: ChallengeObserver
  ) {
    return this.challengeService!.addChallengeObserver(challenge, observer);
  }

  public submitValuesForChallenge(challenge: Challenge, values: ChallengeValue[]) {
    return this.challengeService!.submitValuesForChallenge(challenge, values);
  }

  public cancelChallenge(challenge: Challenge) {
    this.challengeService!.cancelChallenge(challenge);
  }

  /** Set a function to be called when this application deinits */
  public setOnDeinit(onDeinit: (app: SNApplication, source: DeinitSource) => void) {
    this.onDeinit = onDeinit;
  }

  /**
   * Destroys the application instance.
   */
  public deinit(source: DeinitSource) {
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
    this.onDeinit && this.onDeinit!(this, source);
    this.onDeinit = undefined;
    this.crypto = undefined;
    this.createdNewDatabase = false;
    this.services.length = 0;
    this.serviceObservers.length = 0;
    this.managedSubscribers.length = 0;
    this.streamRemovers.length = 0;
    this.clearServices();
    this.dealloced = true;
    this.started = false;
    this.signingIn = false;
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
  ) {
    if (this.hasAccount()) {
      throw Error('Tried to register when an account already exists.');
    }
    if (this.registering) {
      throw Error('Already registering.');
    }
    this.registering = true;
    try {
      this.lockSyncing();
      const result = await this.sessionManager.register(email, password);
      if (!result.response.error) {
        this.syncService!.resetSyncState();
        await this.storageService!.setPersistencePolicy(
          ephemeral
            ? StoragePersistencePolicies.Ephemeral
            : StoragePersistencePolicies.Default
        );
        if (mergeLocal) {
          await this.syncService!.markAllItemsAsNeedingSync(true);
        } else {
          this.itemManager!.removeAllItemsFromMemory();
          await this.clearDatabase();
        }
        await this.notifyEvent(ApplicationEvent.SignedIn);
        this.unlockSyncing();
        await this.syncService!.downloadFirstSync(300);
        this.protocolService!.decryptErroredItems();
      } else {
        this.unlockSyncing();
      }
      return result.response;
    } finally {
      this.registering = false;
    }
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
  ) {
    if (this.hasAccount()) {
      throw Error('Tried to sign in when an account already exists.');
    }
    if (this.signingIn) {
      throw Error('Already signing in.');
    }
    this.signingIn = true;
    try {
      /** Prevent a timed sync from occuring while signing in. */
      this.lockSyncing();
      const result = await this.sessionManager.signIn(
        email, password, strict
      );
      if (!result.response.error) {
        this.syncService!.resetSyncState();
        await this.storageService!.setPersistencePolicy(
          ephemeral
            ? StoragePersistencePolicies.Ephemeral
            : StoragePersistencePolicies.Default
        );
        if (mergeLocal) {
          await this.syncService!.markAllItemsAsNeedingSync(true);
        } else {
          this.itemManager!.removeAllItemsFromMemory();
          await this.clearDatabase();
        }
        await this.notifyEvent(ApplicationEvent.SignedIn);
        this.unlockSyncing();
        const syncPromise = this.syncService!.downloadFirstSync(1_000, {
          checkIntegrity: true,
          awaitAll: awaitSync,
        });
        if (awaitSync) {
          await syncPromise;
          await this.protocolService!.decryptErroredItems();
        } else {
          this.protocolService!.decryptErroredItems();
        }
      } else {
        this.unlockSyncing();
      }
      return result.response;
    } finally {
      this.signingIn = false;
    }
  }

  /**
   * @param passcode - Changing the account password requires the local
   * passcode if configured (to rewrap the account key with passcode). If the passcode
   * is not passed in, the user will be prompted for the passcode. However if the consumer
   * already has reference to the passcode, they can pass it in here so that the user
   * is not prompted again.
   */
  public async changePassword(
    currentPassword: string,
    newPassword: string,
    passcode?: string,
    origination = KeyParamsOrigination.PasswordChange,
    { validatePasswordStrength = true } = {}
  ) {
    const result = await this.performPasswordChange(
      currentPassword,
      newPassword,
      passcode,
      origination,
      { validatePasswordStrength }
    );
    if (result.error) {
      this.alertService.alert(result.error.message);
    }
    return result;
  }

  private async performPasswordChange(
    currentPassword: string,
    newPassword: string,
    passcode?: string,
    origination = KeyParamsOrigination.PasswordChange,
    { validatePasswordStrength = true } = {}
  ): Promise<{ error?: { message: string } }> {
    const { wrappingKey, canceled } = await this.challengeService.getWrappingKeyIfApplicable(
      passcode
    );
    if (canceled) {
      return { error: Error(PasswordChangeStrings.PasscodeRequired) };
    }
    if (validatePasswordStrength) {
      if (newPassword.length < MINIMUM_PASSWORD_LENGTH) {
        return { error: Error(InsufficientPasswordMessage(MINIMUM_PASSWORD_LENGTH)) };
      }
    }
    const accountPasswordValidation = await this.protocolService.validateAccountPassword(
      currentPassword
    );
    if (!accountPasswordValidation.valid) {
      return {
        error: Error(INVALID_PASSWORD)
      }
    }
    /** Current root key must be recomputed as persisted value does not contain server password */
    const currentRootKey = await this.protocolService.computeRootKey(
      currentPassword,
      (await this.protocolService.getRootKeyParams())!
    )
    const newRootKey = await this.protocolService.createRootKey(
      this.getUser()!.email!,
      newPassword,
      origination
    );
    this.lockSyncing();
    /** Now, change the password on the server. Roll back on failure */
    const result = await this.sessionManager.changePassword(
      currentRootKey.serverPassword!,
      newRootKey,
      wrappingKey
    );
    this.unlockSyncing();
    if (!result.response.error) {
      const rollback = await this.protocolService!.createNewItemsKeyWithRollback();
      /** Sync the newly created items key. Roll back on failure */
      await this.protocolService.reencryptItemsKeys();
      await this.syncService!.sync({ awaitAll: true });
      const itemsKeyWasSynced = this.protocolService!.getDefaultItemsKey()!.updated_at.getTime() > 0;
      if (!itemsKeyWasSynced) {
        await this.sessionManager.changePassword(
          newRootKey.serverPassword!,
          currentRootKey,
          wrappingKey
        );
        await this.protocolService.reencryptItemsKeys();
        await rollback();
        await this.syncService!.sync({ awaitAll: true });
        return { error: Error(PasswordChangeStrings.Failed) };
      }
    }
    return result.response;
  }

  public async signOut() {
    await this.sessionManager.signOut();
    await this.protocolService!.clearLocalKeyState();
    await this.storageService!.clearAllData();
    await this.notifyEvent(ApplicationEvent.SignedOut);
    await this.prepareForDeinit();
    this.deinit(DeinitSource.SignOut);
  }

  public async validateAccountPassword(password: string) {
    const { valid } = await this.protocolService!.validateAccountPassword(password);
    return valid;
  }

  public isStarted() {
    return this.started;
  }

  public isLaunched() {
    return this.launched;
  }

  public async hasBiometrics() {
    return this.challengeService!.hasBiometricsEnabled()
  }

  public async enableBiometrics() {
    return this.challengeService!.enableBiometrics()
  }

  public async disableBiometrics() {
    return this.challengeService!.disableBiometrics()
  }

  public hasPasscode() {
    return this.protocolService!.hasPasscode();
  }

  async isLocked() {
    if (!this.started) {
      return true;
    }
    return this.challengeService!.isPasscodeLocked();
  }

  public async lock() {
    /** Because locking is a critical operation, we want to try to do it safely,
     * but only up to a certain limit. */
    const MaximumWaitTime = 500;
    await this.prepareForDeinit(MaximumWaitTime);
    return this.deinit(DeinitSource.Lock);
  }

  public async setPasscode(passcode: string) {
    const dismissBlockingDialog = await this.alertService!.blockingDialog(
      DO_NOT_CLOSE_APPLICATION,
      SETTING_PASSCODE,
    );
    try {
      await this.setPasscodeWithoutWarning(passcode, KeyParamsOrigination.PasscodeCreate);
    } finally {
      dismissBlockingDialog();
    }
  }

  public async removePasscode() {
    const dismissBlockingDialog = await this.alertService!.blockingDialog(
      DO_NOT_CLOSE_APPLICATION,
      REMOVING_PASSCODE,
    );
    try {
      await this.removePasscodeWithoutWarning();
    } finally {
      dismissBlockingDialog();
    }
  }

  public async changePasscode(passcode: string, origination = KeyParamsOrigination.PasscodeChange) {
    const dismissBlockingDialog = await this.alertService!.blockingDialog(
      DO_NOT_CLOSE_APPLICATION,
      origination === KeyParamsOrigination.ProtocolUpgrade
        ? ProtocolUpgradeStrings.UpgradingPasscode
        : CHANGING_PASSCODE,
    );
    try {
      await this.removePasscodeWithoutWarning();
      await this.setPasscodeWithoutWarning(passcode, KeyParamsOrigination.PasscodeChange);
    } finally {
      dismissBlockingDialog();
    }
  }

  private async setPasscodeWithoutWarning(passcode: string, origination: KeyParamsOrigination) {
    const identifier = await this.generateUuid();
    const key = await this.protocolService!.createRootKey(
      identifier,
      passcode,
      origination
    );
    await this.protocolService!.setNewRootKeyWrapper(key);
    await this.rewriteItemsKeys();
    await this.syncService!.sync();
  }

  private async removePasscodeWithoutWarning() {
    await this.protocolService!.removeRootKeyWrapper();
    await this.rewriteItemsKeys();
  }

  public getStorageEncryptionPolicy() {
    return this.storageService!.getStorageEncryptionPolicy();
  }

  public async setStorageEncryptionPolicy(encryptionPolicy: StorageEncryptionPolicies) {
    await this.storageService!.setEncryptionPolicy(encryptionPolicy);
    return this.protocolService!.repersistAllItems();
  }

  public enableEphemeralPersistencePolicy(): Promise<void> {
    return this.storageService.setPersistencePolicy(
      StoragePersistencePolicies.Ephemeral
    );
  }

  public hasPendingMigrations() {
    return this.migrationService.hasPendingMigrations();
  }

  public generateUuid() {
    return Uuid.GenerateUuid();
  }

  public presentKeyRecoveryWizard(): Promise<void> {
    return this.keyRecoveryService!.processPersistedUndecryptables();
  }

  /**
   * Dynamically change the device interface, i.e when Desktop wants to override
   * default web interface.
   */
  public async changeDeviceInterface(deviceInterface: DeviceInterface) {
    this.deviceInterface = deviceInterface;
    for (const service of this.services) {
      if (service.deviceInterface) {
        service.deviceInterface = deviceInterface;
      }
    }
  }

  private constructServices() {
    this.createModelManager();
    this.createItemManager();
    this.createStorageManager();
    this.createProtocolService();
    const encryptionDelegate = {
      payloadByEncryptingPayload: this.protocolService!.payloadByEncryptingPayload.bind(this.protocolService),
      payloadByDecryptingPayload: this.protocolService!.payloadByDecryptingPayload.bind(this.protocolService)
    };
    this.storageService!.encryptionDelegate = encryptionDelegate;
    this.createChallengeService();
    this.createHttpManager();
    this.createApiService();
    this.createSessionManager();
    this.createMigrationService();
    this.createSyncManager();
    this.createKeyRecoveryService();
    this.createSingletonManager();
    this.createComponentManager();
    this.createPrivilegesService();
    this.createHistoryManager();
    this.createActionsManager();
  }

  private clearServices() {
    (this.migrationService as any) = undefined;
    (this.alertService as any) = undefined;
    (this.httpService as any) = undefined;
    (this.modelManager as any) = undefined;
    (this.protocolService as any) = undefined;
    (this.storageService as any) = undefined;
    (this.apiService as any) = undefined;
    (this.sessionManager as any) = undefined;
    (this.syncService as any) = undefined;
    (this.challengeService as any) = undefined;
    (this.singletonManager as any) = undefined;
    (this.componentManager as any) = undefined;
    (this.privilegesService as any) = undefined;
    (this.actionsManager as any) = undefined;
    (this.historyManager as any) = undefined;
    (this.itemManager as any) = undefined;
    (this.keyRecoveryService as any) = undefined;

    this.services = [];
  }

  private createMigrationService() {
    this.migrationService = new SNMigrationService(
      {
        protocolService: this.protocolService!,
        deviceInterface: this.deviceInterface!,
        storageService: this.storageService!,
        sessionManager: this.sessionManager,
        challengeService: this.challengeService!,
        itemManager: this.itemManager!,
        environment: this.environment!,
        identifier: this.identifier
      }
    );
    this.services.push(this.migrationService!);
  }

  private createApiService() {
    this.apiService = new SNApiService(
      this.httpService!,
      this.storageService!,
      this.defaultHost
    );
    this.services.push(this.apiService!);
  }

  private createItemManager() {
    this.itemManager = new ItemManager(this.modelManager!);
    this.services.push(this.itemManager!);
  }

  private createComponentManager() {
    if (this.shouldSkipClass(SNComponentManager)) {
      return;
    }
    const MaybeSwappedComponentManager = this.getClass<typeof SNComponentManager>(SNComponentManager)
    this.componentManager = new MaybeSwappedComponentManager(
      this.itemManager!,
      this.syncService!,
      this.alertService!,
      this.environment!,
      this.platform!,
      this.deviceInterface!.timeout,
    );
    this.services.push(this.componentManager!);
  }

  private createHttpManager() {
    this.httpService = new SNHttpService();
    this.services.push(this.httpService!);
  }

  private createModelManager() {
    this.modelManager = new PayloadManager();
    this.services.push(this.modelManager!);
  }

  private createSingletonManager() {
    this.singletonManager = new SNSingletonManager(
      this.itemManager!,
      this.syncService!
    );
    this.services.push(this.singletonManager!);
  }

  private createStorageManager() {
    this.storageService = new SNStorageService(
      this.deviceInterface!,
      this.alertService,
      this.identifier,
      this.environment
    );
    this.services.push(this.storageService!);
  }

  private createProtocolService() {
    this.protocolService = new SNProtocolService(
      this.itemManager!,
      this.modelManager!,
      this.deviceInterface!,
      this.storageService!,
      this.identifier,
      this.crypto!
    );
    this.protocolService!.onKeyStatusChange(async () => {
      await this.notifyEvent(ApplicationEvent.KeyStatusChanged);
    });
    this.services.push(this.protocolService!);
  }

  private createKeyRecoveryService() {
    this.keyRecoveryService = new SNKeyRecoveryService(
      this.itemManager,
      this.modelManager,
      this.apiService,
      this.sessionManager,
      this.protocolService,
      this.challengeService,
      this.alertService,
      this.storageService,
      this.syncService
    );
    this.services.push(this.keyRecoveryService!);
  }

  private createSessionManager() {
    this.sessionManager = new SNSessionManager(
      this.storageService,
      this.apiService,
      this.alertService,
      this.protocolService,
      this.challengeService
    );
    this.serviceObservers.push(this.sessionManager.addEventObserver(async event => {
      if (event === SessionEvent.SessionRestored) {
        this.sync();
      }
    }));
    this.services.push(this.sessionManager);
  }

  private createSyncManager() {
    this.syncService = new SNSyncService(
      this.itemManager!,
      this.sessionManager,
      this.protocolService!,
      this.storageService!,
      this.modelManager!,
      this.apiService!,
      this.deviceInterface!.interval
    );
    const syncEventCallback = async (eventName: SyncEvent) => {
      const appEvent = applicationEventForSyncEvent(eventName);
      if (appEvent) {
        await this.notifyEvent(appEvent);
      }
      await this.protocolService!.onSyncEvent(eventName);
    };
    const uninstall = this.syncService!.addEventObserver(syncEventCallback);
    this.serviceObservers.push(uninstall);
    this.services.push(this.syncService!);
  }

  private createChallengeService() {
    this.challengeService = new ChallengeService(
      this.storageService!,
      this.protocolService!
    );
    this.services.push(this.challengeService!);
  }

  private createPrivilegesService() {
    this.privilegesService = new SNPrivilegesService(
      this.itemManager!,
      this.syncService!,
      this.singletonManager!,
      this.protocolService!,
      this.storageService!,
      this.sessionManager,
    );
    this.services.push(this.privilegesService!);
  }

  private createHistoryManager() {
    this.historyManager = new SNHistoryManager(
      this.itemManager!,
      this.storageService!,
      this.apiService!,
      this.protocolService!,
      [ContentType.Note],
      this.deviceInterface!.timeout
    );
    this.services.push(this.historyManager!);
  }

  private createActionsManager() {
    this.actionsManager = new SNActionsService(
      this.itemManager!,
      this.alertService!,
      this.deviceInterface!,
      this.httpService!,
      this.modelManager!,
      this.protocolService!,
      this.syncService!,
    );
    this.services.push(this.actionsManager!);
  }

  private shouldSkipClass(classCandidate: any) {
    return this.skipClasses && this.skipClasses.includes(classCandidate);
  }

  private getClass<T>(base: T) {
    const swapClass = this.swapClasses && this.swapClasses.find((candidate) => candidate.swap === base);
    if (swapClass) {
      return swapClass.with as T;
    } else {
      return base;
    }
  }
}
