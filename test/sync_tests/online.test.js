/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
import * as Factory from '../lib/factory.js';
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('online syncing', function () {
  this.timeout(Factory.TestTimeout);
  const BASE_ITEM_COUNT = 2; /** Default items key, user preferences */

  const syncOptions = {
    checkIntegrity: true,
    awaitAll: true,
  };

  beforeEach(async function () {
    localStorage.clear();
    this.expectedItemCount = BASE_ITEM_COUNT;
    this.application = await Factory.createInitAppWithRandNamespace();
    this.email = Uuid.GenerateUuidSynchronously();
    this.password = Uuid.GenerateUuidSynchronously();
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });
    this.signOut = async () => {
      this.application = await Factory.signOutApplicationAndReturnNew(
        this.application
      );
    };
    this.signIn = async () => {
      await this.application.signIn(
        this.email,
        this.password,
        undefined,
        undefined,
        undefined,
        true
      );
    };
  });

  afterEach(async function () {
    expect(this.application.syncService.isOutOfSync()).to.equal(false);
    const items = this.application.itemManager.items;
    expect(items.length).to.equal(this.expectedItemCount);
    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(this.expectedItemCount);
    await this.application.deinit();
    localStorage.clear();
  });

  function noteObjectsFromObjects(items) {
    return items.filter((item) => item.content_type === ContentType.Note);
  }

  it('should register and sync basic model online', async function () {
    let note = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;
    expect(this.application.itemManager.getDirtyItems().length).to.equal(0);
    note = this.application.findItem(note.uuid);
    expect(note.dirty).to.not.be.ok;

    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    const notePayloads = noteObjectsFromObjects(rawPayloads);
    expect(notePayloads.length).to.equal(1);
    for (const rawNote of notePayloads) {
      expect(rawNote.dirty).to.not.be.ok;
    }
  });

  it('should login and retrieve synced item', async function () {
    const note = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;
    this.application = await Factory.signOutApplicationAndReturnNew(
      this.application
    );

    await Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const notes = this.application.itemManager.notes;
    expect(notes.length).to.equal(1);
    expect(notes[0].title).to.equal(note.title);
  });

  it('can complete multipage sync on sign in', async function () {
    const count = 0;
    await Factory.createManyMappedNotes(this.application, count);
    this.expectedItemCount += count;
    await this.application.sync(syncOptions);
    this.application = await Factory.signOutApplicationAndReturnNew(
      this.application
    );
    expect(this.application.itemManager.items.length).to.equal(BASE_ITEM_COUNT);
    const promise = Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });
    /** Throw in some random syncs to cause trouble */
    const syncCount = 30;
    for (let i = 0; i < syncCount; i++) {
      this.application.sync(syncOptions);
      await Factory.sleep(0.01);
    }
    await promise;
    expect(promise).to.be.fulfilled;
    /** Allow any unwaited syncs in for loop to complete */
    await Factory.sleep(0.5);
  }).timeout(20000);

  it('uuid alternation should delete original payload', async function () {
    this.application = await Factory.signOutApplicationAndReturnNew(
      this.application
    );
    const note = await Factory.createMappedNote(this.application);
    this.expectedItemCount++;
    await this.application.syncService.alternateUuidForItem(note.uuid);
    await this.application.sync(syncOptions);

    const notes = this.application.itemManager.notes;
    expect(notes.length).to.equal(1);
    expect(notes[0].uuid).to.not.equal(note.uuid);
  });

  it('having offline data then signing in should not alternate uuid and merge with account', async function () {
    this.application = await Factory.signOutApplicationAndReturnNew(
      this.application
    );
    const note = await Factory.createMappedNote(this.application);
    this.expectedItemCount++;
    await Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
      mergeLocal: true,
    });

    const notes = this.application.itemManager.notes;
    expect(notes.length).to.equal(1);
    /** uuid should have been alternated */
    expect(notes[0].uuid).to.equal(note.uuid);
  });

  it('server extensions should not be encrypted for sync', async function () {
    const payload = CreateMaxPayloadFromAnyObject({
      uuid: await Uuid.GenerateUuid(),
      content_type: ContentType.Mfa,
      content: {
        secret: '123',
      },
    });
    const results = await payloadsByPreparingForServer(
      this.application.protocolService,
      [payload]
    );
    const processed = results[0];
    expect(processed.format).to.equal(PayloadFormat.DecryptedBase64String);
  });

  it('resolve on next timing strategy', async function () {
    const syncCount = 7;
    let successes = 0;
    let events = 0;

    this.application.syncService.ut_beginLatencySimulator(250);
    this.application.syncService.addEventObserver((event, data) => {
      if (event === SyncEvent.FullSyncCompleted) {
        events++;
      }
    });

    const promises = [];
    for (let i = 0; i < syncCount; i++) {
      promises.push(
        this.application.syncService
          .sync({
            queueStrategy: SyncQueueStrategy.ResolveOnNext,
          })
          .then(() => {
            successes++;
          })
      );
    }

    await Promise.all(promises);
    expect(successes).to.equal(syncCount);
    // Only a fully executed sync request creates a sync:completed event.
    // We don't know how many will execute above.
    expect(events).to.be.at.least(1);

    this.application.syncService.ut_endLatencySimulator();
    // Since the syncs all happen after one another, extra syncs may be queued on that we are not awaiting.
    await Factory.sleep(0.5);
  });

  it('force spawn new timing strategy', async function () {
    const syncCount = 7;
    let successes = 0;
    let events = 0;

    this.application.syncService.ut_beginLatencySimulator(250);

    this.application.syncService.addEventObserver((event, data) => {
      if (event === SyncEvent.FullSyncCompleted) {
        events++;
      }
    });

    const promises = [];
    for (let i = 0; i < syncCount; i++) {
      promises.push(
        this.application.syncService
          .sync({
            queueStrategy: SyncQueueStrategy.ForceSpawnNew,
          })
          .then(() => {
            successes++;
          })
      );
    }
    await Promise.all(promises);
    expect(successes).to.equal(syncCount);
    expect(events).to.equal(syncCount);
    this.application.syncService.ut_endLatencySimulator();
  });

  it('retrieving new items should not mark them as dirty', async function () {
    const originalNote = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;
    this.application = await Factory.signOutApplicationAndReturnNew(
      this.application
    );
    this.application.syncService.addEventObserver((event, data) => {
      if (event === SyncEvent.SingleSyncCompleted) {
        const note = this.application.findItem(originalNote.uuid);
        expect(note.dirty).to.not.be.ok;
      }
    });
    await this.application.signIn(
      this.email,
      this.password,
      undefined,
      undefined,
      undefined,
      true
    );
  });

  it('allows me to save data after Ive signed out', async function () {
    expect(this.application.itemManager.itemsKeys().length).to.equal(1);
    this.application = await Factory.signOutApplicationAndReturnNew(
      this.application
    );
    expect(this.application.itemManager.itemsKeys().length).to.equal(1);
    const note = await Factory.createMappedNote(this.application);
    this.expectedItemCount++;
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);
    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    const notePayload = noteObjectsFromObjects(rawPayloads);
    expect(notePayload.length).to.equal(1);
    expect(this.application.itemManager.notes.length).to.equal(1);

    // set item to be merged for when sign in occurs
    await this.application.syncService.markAllItemsAsNeedingSync();
    expect(this.application.syncService.isOutOfSync()).to.equal(false);
    expect(this.application.itemManager.getDirtyItems().length).to.equal(
      BASE_ITEM_COUNT + 1
    );

    // Sign back in for next tests
    await Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    expect(this.application.itemManager.getDirtyItems().length).to.equal(0);
    expect(this.application.itemManager.itemsKeys().length).to.equal(1);
    expect(this.application.syncService.isOutOfSync()).to.equal(false);
    expect(this.application.itemManager.notes.length).to.equal(1);

    for (const item of this.application.itemManager.notes) {
      expect(item.content.title).to.be.ok;
    }

    const updatedRawPayloads = await this.application.storageService.getAllRawPayloads();
    for (const payload of updatedRawPayloads) {
      // if an item comes back from the server, it is saved to disk immediately without a dirty value.
      expect(payload.dirty).to.not.be.ok;
    }
  });

  it('mapping should not mutate items with error decrypting state', async function () {
    const note = await Factory.createMappedNote(this.application);
    this.expectedItemCount++;
    const originalTitle = note.content.title;
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);

    const encrypted = await this.application.protocolService.payloadByEncryptingPayload(
      note.payloadRepresentation(),
      EncryptionIntent.Sync
    );
    const errorred = CreateMaxPayloadFromAnyObject(encrypted, {
      errorDecrypting: true,
    });
    const items = await this.application.itemManager.emitItemsFromPayloads(
      [errorred],
      PayloadSource.LocalChanged
    );
    const mappedItem = items[0];
    expect(typeof mappedItem.content).to.equal('string');

    const decryptedPayload = await this.application.protocolService.payloadByDecryptingPayload(
      errorred
    );
    const mappedItems2 = await this.application.itemManager.emitItemsFromPayloads(
      [decryptedPayload],
      PayloadSource.LocalChanged
    );
    const mappedItem2 = mappedItems2[0];
    expect(typeof mappedItem2.content).to.equal('object');
    expect(mappedItem2.content.title).to.equal(originalTitle);
  });

  it('signing into account with pre-existing items', async function () {
    const note = await Factory.createMappedNote(this.application);
    await this.application.saveItem(note.uuid);
    this.expectedItemCount += 1;

    this.application = await Factory.signOutApplicationAndReturnNew(
      this.application
    );
    await this.application.signIn(
      this.email,
      this.password,
      undefined,
      undefined,
      undefined,
      true
    );

    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
  });

  it('removes item from storage upon deletion', async function () {
    let note = await Factory.createMappedNote(this.application);
    this.expectedItemCount++;
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);
    note = this.application.findItem(note.uuid);
    expect(note.dirty).to.equal(false);
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );

    await this.application.itemManager.setItemToBeDeleted(note.uuid);
    note = this.application.findItem(note.uuid);
    expect(note.dirty).to.equal(true);
    this.expectedItemCount--;

    await this.application.syncService.sync(syncOptions);
    note = this.application.findItem(note.uuid);
    expect(note).to.not.be.ok;
    expect(this.application.syncService.state.discordance).to.equal(0);

    // We expect that this item is now gone for good, and no duplicate has been created.
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    await Factory.sleep(0.5);
    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(this.expectedItemCount);
  });

  it('retrieving item with no content should correctly map local state', async function () {
    const note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);
    const syncToken = await this.application.syncService.getLastSyncToken();
    this.expectedItemCount++;
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );

    // client A
    await this.application.itemManager.setItemToBeDeleted(note.uuid);
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);

    // Subtract 1
    this.expectedItemCount--;

    // client B
    // Clearing sync tokens wont work as server wont return deleted items.
    // Set saved sync token instead
    await this.application.syncService.setLastSyncToken(syncToken);
    await this.application.syncService.sync(syncOptions);

    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
  });

  it('deleting an item while it is being synced should keep deletion state', async function () {
    const note = await Factory.createMappedNote(this.application);
    this.expectedItemCount++;

    /** Begin syncing it with server but introduce latency so we can sneak in a delete */
    this.application.syncService.ut_beginLatencySimulator(500);
    const sync = this.application.sync();
    /** Sleep so sync call can begin preparations but not fully begin */
    await Factory.sleep(0.1);
    await this.application.itemManager.setItemToBeDeleted(note.uuid);
    this.expectedItemCount--;
    await sync;
    this.application.syncService.ut_endLatencySimulator();
    await this.application.sync(syncOptions);

    /** We expect that item has been deleted */
    const allItems = this.application.itemManager.items;
    expect(allItems.length).to.equal(this.expectedItemCount);
  });

  it('items that are never synced and deleted should not be uploaded to server', async function () {
    const note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.itemManager.setItemToBeDeleted(note.uuid);

    let success = true;
    let didCompleteRelevantSync = false;
    let beginCheckingResponse = false;
    this.application.syncService.addEventObserver((eventName, data) => {
      if (eventName === SyncEvent.DownloadFirstSyncCompleted) {
        beginCheckingResponse = true;
      }
      if (!beginCheckingResponse) {
        return;
      }
      if (
        !didCompleteRelevantSync &&
        eventName === SyncEvent.SingleSyncCompleted
      ) {
        didCompleteRelevantSync = true;
        const response = data;
        const matching = response.savedPayloads.find(
          (p) => p.uuid === note.uuid
        );
        if (matching) {
          success = false;
        }
      }
    });
    await this.application.syncService.sync({ mode: SyncModes.DownloadFirst });
    expect(didCompleteRelevantSync).to.equal(true);
    expect(success).to.equal(true);
  });

  it('items that are deleted after download first sync complete should not be uploaded to server', async function () {
    /** The singleton manager may delete items are download first. We dont want those uploaded to server. */
    const note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);

    let success = true;
    let didCompleteRelevantSync = false;
    let beginCheckingResponse = false;
    this.application.syncService.addEventObserver(async (eventName, data) => {
      if (eventName === SyncEvent.DownloadFirstSyncCompleted) {
        await this.application.itemManager.setItemToBeDeleted(note.uuid);
        beginCheckingResponse = true;
      }
      if (!beginCheckingResponse) {
        return;
      }
      if (
        !didCompleteRelevantSync &&
        eventName === SyncEvent.SingleSyncCompleted
      ) {
        didCompleteRelevantSync = true;
        const response = data;
        const matching = response.savedPayloads.find(
          (p) => p.uuid === note.uuid
        );
        if (matching) {
          success = false;
        }
      }
    });
    await this.application.syncService.sync({ mode: SyncModes.DownloadFirst });
    expect(didCompleteRelevantSync).to.equal(true);
    expect(success).to.equal(true);
  });

  it('marking an item dirty then saving to disk should retain that dirty state when restored', async function () {
    const note = await Factory.createMappedNote(this.application);
    this.expectedItemCount++;
    await this.application.syncService.markAllItemsAsNeedingSync();

    this.application.itemManager.resetState();
    this.application.payloadManager.resetState();
    await this.application.syncService.clearSyncPositionTokens();

    expect(this.application.itemManager.items.length).to.equal(0);

    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    const encryptedPayloads = rawPayloads.map((rawPayload) => {
      return CreateMaxPayloadFromAnyObject(rawPayload);
    });
    const payloads = [];
    for (const payload of encryptedPayloads) {
      expect(payload.dirty).to.equal(true);
      const decrypted = await this.application.protocolService.payloadByDecryptingPayload(
        payload
      );
      payloads.push(decrypted);
    }
    await this.application.itemManager.emitItemsFromPayloads(
      payloads,
      PayloadSource.LocalChanged
    );
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    const foundNote = this.application.itemManager.findItem(note.uuid);
    expect(foundNote.dirty).to.equal(true);
    await this.application.syncService.sync(syncOptions);
  });

  it('should handle uploading with sync pagination', async function () {
    const largeItemCount = 160;
    for (let i = 0; i < largeItemCount; i++) {
      const note = await Factory.createMappedNote(this.application);
      await this.application.itemManager.setItemDirty(note.uuid);
    }

    this.expectedItemCount += largeItemCount;

    await this.application.syncService.sync(syncOptions);
    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(this.expectedItemCount);
  }).timeout(15000);

  it('should handle downloading with sync pagination', async function () {
    const largeItemCount = 160;
    for (let i = 0; i < largeItemCount; i++) {
      const note = await Factory.createMappedNote(this.application);
      await this.application.itemManager.setItemDirty(note.uuid);
    }
    /** Upload */
    await this.application.syncService.sync(syncOptions);
    this.expectedItemCount += largeItemCount;

    /** Clear local data */
    await this.application.payloadManager.resetState();
    await this.application.itemManager.resetState();
    await this.application.syncService.clearSyncPositionTokens();
    await this.application.storageService.clearAllPayloads();
    expect(this.application.itemManager.items.length).to.equal(0);

    /** Download all data */
    await this.application.syncService.sync(syncOptions);
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(this.expectedItemCount);
  }).timeout(20000);

  it('should be able to download all items separate of sync', async function () {
    const largeItemCount = 20;
    for (let i = 0; i < largeItemCount; i++) {
      const note = await Factory.createMappedNote(this.application);
      await this.application.itemManager.setItemDirty(note.uuid);
    }
    /** Upload */
    await this.application.syncService.sync(syncOptions);
    this.expectedItemCount += largeItemCount;

    /** Download */
    const downloadedItems = await this.application.syncService.statelessDownloadAllItems();
    expect(downloadedItems.length).to.equal(this.expectedItemCount);
    // ensure it's decrypted
    expect(downloadedItems[10].content.text.length).to.be.above(1);
    expect(downloadedItems[10].text.length).to.be.above(1);
  });

  it('syncing an item should storage it encrypted', async function () {
    const note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);
    this.expectedItemCount++;
    const rawPayloads = await this.application.syncService.getDatabasePayloads();
    const notePayload = rawPayloads.find(
      (p) => p.content_type === ContentType.Note
    );
    expect(typeof notePayload.content).to.equal('string');
  });

  it('syncing an item before data load should storage it encrypted', async function () {
    const note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    this.expectedItemCount++;

    /** Simulate database not loaded */
    await this.application.syncService.clearSyncPositionTokens();
    this.application.syncService.ut_setDatabaseLoaded(false);
    this.application.syncService.sync(syncOptions);
    await Factory.sleep(0.3);

    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    const notePayload = rawPayloads.find(
      (p) => p.content_type === ContentType.Note
    );
    expect(typeof notePayload.content).to.equal('string');
  });

  it('saving an item after sync should persist it with content property', async function () {
    const note = await Factory.createMappedNote(this.application);
    const text = Factory.randomString(10000);
    await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        mutator.text = text;
      },
      undefined,
      undefined,
      syncOptions
    );
    this.expectedItemCount++;
    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    const notePayload = rawPayloads.find(
      (p) => p.content_type === ContentType.Note
    );
    expect(typeof notePayload.content).to.equal('string');
    expect(notePayload.content.length).to.be.above(text.length);
  });

  it('syncing a new item before local data has loaded should still persist the item to disk', async function () {
    this.application.syncService.ut_setDatabaseLoaded(false);
    /** You don't want to clear model manager state as we'll lose encrypting items key */
    // await this.application.payloadManager.resetState();
    await this.application.syncService.clearSyncPositionTokens();
    expect(this.application.itemManager.getDirtyItems().length).to.equal(0);

    let note = await Factory.createMappedNote(this.application);
    note = await this.application.itemManager.changeItem(
      note.uuid,
      (mutator) => {
        mutator.text = `${Math.random()}`;
      }
    );
    /** This sync request should exit prematurely as we called ut_setDatabaseNotLoaded */
    /** Do not await. Sleep instead. */
    this.application.syncService.sync(syncOptions);
    await Factory.sleep(0.3);
    this.expectedItemCount++;

    /** Item should still be dirty */
    expect(note.dirty).to.equal(true);
    expect(this.application.itemManager.getDirtyItems().length).to.equal(1);

    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(this.expectedItemCount);
    const rawPayload = rawPayloads.find((p) => p.uuid === note.uuid);
    expect(rawPayload.uuid).to.equal(note.uuid);
    expect(rawPayload.dirty).equal(true);
    expect(typeof rawPayload.content).to.equal('string');

    /** Clear state data and upload item from storage to server */
    await this.application.syncService.clearSyncPositionTokens();
    await this.application.payloadManager.resetState();
    await this.application.itemManager.resetState();
    const databasePayloads = await this.application.storageService.getAllRawPayloads();
    await this.application.syncService.loadDatabasePayloads(databasePayloads);
    await this.application.syncService.sync(syncOptions);

    const newRawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(newRawPayloads.length).to.equal(this.expectedItemCount);

    const currentItem = this.application.itemManager.findItem(note.uuid);
    expect(currentItem.content.text).to.equal(note.content.text);
    expect(currentItem.text).to.equal(note.text);
    expect(currentItem.dirty).to.not.be.ok;
  });

  it('load local items should respect sort priority', async function () {
    const contentTypes = ['A', 'B', 'C'];
    const itemCount = 6;
    const originalPayloads = [];
    for (let i = 0; i < itemCount; i++) {
      const payload = Factory.createStorageItemPayload(
        contentTypes[Math.floor(i / 2)]
      );
      originalPayloads.push(payload);
    }
    const sorted = SortPayloadsByRecentAndContentPriority(originalPayloads, [
      'C',
      'A',
      'B',
    ]);
    expect(sorted[0].content_type).to.equal('C');
    expect(sorted[2].content_type).to.equal('A');
    expect(sorted[4].content_type).to.equal('B');
  });

  it('should sign in and retrieve large number of items', async function () {
    const largeItemCount = 50;
    await Factory.createManyMappedNotes(this.application, largeItemCount);
    this.expectedItemCount += largeItemCount;
    await this.application.syncService.sync(syncOptions);

    this.application = await Factory.signOutApplicationAndReturnNew(
      this.application
    );
    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(BASE_ITEM_COUNT);

    await this.application.signIn(
      this.email,
      this.password,
      undefined,
      undefined,
      undefined,
      true
    );

    this.application.syncService.ut_setDatabaseLoaded(false);
    const databasePayloads = await this.application.storageService.getAllRawPayloads();
    await this.application.syncService.loadDatabasePayloads(databasePayloads);
    await this.application.syncService.sync(syncOptions);

    const items = await this.application.itemManager.items;
    expect(items.length).to.equal(this.expectedItemCount);
  }).timeout(20000);

  it('valid sync date tracking', async function () {
    let note = await Factory.createMappedNote(this.application);
    note = await this.application.itemManager.setItemDirty(note.uuid);
    this.expectedItemCount++;

    expect(note.dirty).to.equal(true);
    expect(note.dirtiedDate).to.be.at.most(new Date());

    note = await this.application.itemManager.changeItem(
      note.uuid,
      (mutator) => {
        mutator.text = `${Math.random()}`;
      }
    );
    const sync = this.application.sync();
    await Factory.sleep(0.1);
    note = this.application.findItem(note.uuid);
    expect(note.lastSyncBegan).to.be.below(new Date());
    await sync;
    expect(note.dirty).to.equal(false);
    expect(note.lastSyncEnd).to.be.at.least(note.lastSyncBegan);
  });

  it('syncing twice without waiting should only execute 1 online sync', async function () {
    const expectedEvents = 1;
    let actualEvents = 0;
    this.application.syncService.addEventObserver((event, data) => {
      if (
        event === SyncEvent.FullSyncCompleted &&
        data.source === SyncSources.External
      ) {
        actualEvents++;
      }
    });
    const first = this.application.sync();
    const second = this.application.sync();
    await Promise.all([first, second]);
    /** Sleep so that any automatic syncs that are triggered are also sent to handler above */
    await Factory.sleep(0.5);
    expect(actualEvents).to.equal(expectedEvents);
  });

  it('should keep an item dirty thats been modified after low latency sync request began', async function () {
    /**
     * If you begin a sync request that takes 20s to complete, then begin modifying an item
     * many times and attempt to sync, it will await the initial sync to complete.
     * When that completes, it will decide whether an item is still dirty or not.
     * It will do based on comparing whether item.dirtiedDate > item.lastSyncBegan
     */
    let note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    this.expectedItemCount++;

    // client A. Don't await, we want to do other stuff.
    this.application.syncService.ut_beginLatencySimulator(1500);
    const slowSync = this.application.syncService.sync(syncOptions);
    await Factory.sleep(0.1);
    expect(note.dirty).to.equal(true);

    // While that sync is going on, we want to modify this item many times.
    const text = `${Math.random()}`;
    note = await this.application.itemManager.changeItem(
      note.uuid,
      (mutator) => {
        mutator.text = text;
      }
    );
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.itemManager.setItemDirty(note.uuid);
    expect(note.dirtiedDate).to.be.above(note.lastSyncBegan);

    // Now do a regular sync with no latency.
    this.application.syncService.ut_endLatencySimulator();
    const midSync = this.application.syncService.sync(syncOptions);

    await slowSync;
    await midSync;

    note = this.application.findItem(note.uuid);
    expect(note.dirty).to.equal(false);
    expect(note.lastSyncEnd).to.be.above(note.lastSyncBegan);
    expect(note.content.text).to.equal(text);

    // client B
    await this.application.payloadManager.resetState();
    await this.application.itemManager.resetState();
    await this.application.syncService.clearSyncPositionTokens();
    await this.application.syncService.sync(syncOptions);

    // Expect that the server value and client value match, and no conflicts are created.
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    const foundItem = this.application.itemManager.findItem(note.uuid);
    expect(foundItem.content.text).to.equal(text);
    expect(foundItem.text).to.equal(text);
  });

  it('should sync an item twice if its marked dirty while a sync is ongoing', async function () {
    /** We can't track how many times an item is synced, only how many times its mapped */
    const expectedSaveCount = 2;
    let actualSaveCount = 0;
    /** Create an item and sync it */
    let note = await Factory.createMappedNote(this.application);
    this.application.itemManager.addObserver(
      ContentType.Note,
      (changed, inserted, discarded, ignored, source) => {
        if (source === PayloadSource.RemoteSaved) {
          actualSaveCount++;
        }
      }
    );
    this.expectedItemCount++;
    this.application.syncService.ut_beginLatencySimulator(150);
    /** Dont await */
    const syncRequest = this.application.syncService.sync(syncOptions);
    /** Dirty the item 100ms into 150ms request */
    const newText = `${Math.random()}`;
    setTimeout(
      async function () {
        await this.application.itemManager.changeItem(note.uuid, (mutator) => {
          mutator.text = newText;
        });
      }.bind(this),
      100
    );
    /**
     * Await sync request. A sync request will perform another request if there
     * are still more dirty items, so awaiting this will perform two syncs.
     */
    await syncRequest;
    expect(actualSaveCount).to.equal(expectedSaveCount);
    note = this.application.findItem(note.uuid);
    expect(note.text).to.equal(newText);
  });

  it('marking item dirty after dirty items are prepared for sync but before they are synced should sync again', async function () {
    /** There is a twilight zone where items needing sync are popped, and then say about 100ms of processing before
     * we set those items lastSyncBegan. If the item is dirtied in between these times, then item.dirtiedDate will be less than
     * item.lastSyncBegan, and it will not by synced again.
     */
    const expectedSaveCount = 2;
    let actualSaveCount = 0;
    /** Create an item and sync it */
    let note = await Factory.createMappedNote(this.application);
    this.application.itemManager.addObserver(
      ContentType.Note,
      (_changed, _inserted, _discarded, _ignored, source) => {
        if (source === PayloadSource.RemoteSaved) {
          actualSaveCount++;
        }
      }
    );
    this.expectedItemCount++;
    /** Dont await */
    const syncRequest = this.application.syncService.sync(syncOptions);
    /** Dirty the item before lastSyncBegan is set */
    let didPerformMutatation = false;
    const newText = `${Math.random()}`;
    this.application.syncService.addEventObserver(async (eventName) => {
      if (eventName === SyncEvent.SyncWillBegin && !didPerformMutatation) {
        didPerformMutatation = true;
        await this.application.itemManager.changeItem(note.uuid, (mutator) => {
          mutator.text = newText;
        });
      }
    });
    await syncRequest;
    expect(actualSaveCount).to.equal(expectedSaveCount);
    note = this.application.findItem(note.uuid);
    expect(note.text).to.equal(newText);
  });

  it('marking item dirty at exact same time as lastSyncBegan should sync again', async function () {
    /** Due to lack of nanosecond support in JS, it's possible that two operations complete
     * within the same millisecond cycle. What happens if you mark an item as dirty at time A and also begin
     * syncing at time A? It should sync again. */
    const expectedSaveCount = 2;
    let actualSaveCount = 0;
    /** Create an item and sync it */
    let note = await Factory.createMappedNote(this.application);
    let didPerformMutatation = false;
    const newText = `${Math.random()}`;
    this.application.itemManager.addObserver(
      ContentType.Note,
      async (changed, _inserted, _discarded, _ignored, source) => {
        if (source === PayloadSource.RemoteSaved) {
          actualSaveCount++;
        } else if (
          source === PayloadSource.PreSyncSave &&
          !didPerformMutatation
        ) {
          didPerformMutatation = true;
          const mutated = CopyPayload(changed[0].payload, {
            content: { ...note.payload.content, text: newText },
            dirty: true,
            dirtiedDate: changed[0].lastSyncBegan,
          });
          await this.application.itemManager.emitItemFromPayload(mutated);
        }
      }
    );
    this.expectedItemCount++;
    /** Dont await */
    const syncRequest = this.application.syncService.sync(syncOptions);
    await syncRequest;
    expect(actualSaveCount).to.equal(expectedSaveCount);
    note = this.application.findItem(note.uuid);
    expect(note.text).to.equal(newText);
  });

  it('retreiving a remote deleted item should succeed', async function () {
    const note = await Factory.createSyncedNote(this.application);
    const preDeleteSyncToken = await this.application.syncService.getLastSyncToken();
    await this.application.deleteItem(note);
    await this.application.syncService.setLastSyncToken(preDeleteSyncToken);
    await this.application.sync(syncOptions);
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
  });

  it('errored items should not be synced', async function () {
    const note = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;
    const lastSyncBegan = note.lastSyncBegan;
    const lastSyncEnd = note.lastSyncEnd;
    const encrypted = await this.application.protocolService.payloadByEncryptingPayload(
      note.payload,
      EncryptionIntent.Sync
    );
    const errored = CopyPayload(encrypted, {
      errorDecrypting: true,
      dirty: true,
    });
    await this.application.itemManager.emitItemFromPayload(errored);
    await this.application.sync(syncOptions);

    const updatedNote = this.application.findItem(note.uuid);
    expect(updatedNote.lastSyncBegan.getTime()).to.equal(
      lastSyncBegan.getTime()
    );
    expect(updatedNote.lastSyncEnd.getTime()).to.equal(lastSyncEnd.getTime());
  });

  it('syncing with missing session object should prompt for re-auth', async function () {
    /**
     * This covers the temporary function syncService.handleInvalidSessionState
     * where mobile could be missing storage/session object
     */
    let didPromptForSignIn = false;
    const receiveChallenge = async (challenge) => {
      didPromptForSignIn = true;
      this.application.submitValuesForChallenge(challenge, [
        new ChallengeValue(challenge.prompts[0], this.email),
        new ChallengeValue(challenge.prompts[1], this.password),
      ]);
    };
    this.application.setLaunchCallback({ receiveChallenge });
    this.application.apiService.setSession(undefined);

    await this.application.sync();

    /** Allow session recovery to do its thing */
    await Factory.sleep(2.0);

    expect(didPromptForSignIn).to.equal(true);
    expect(this.application.apiService.session.accessToken).to.be.ok;
    expect(this.application.apiService.session.refreshToken).to.be.ok;
  });

  it('should not allow receiving decrypted payloads from server', async function () {
    const masterCollection = this.application.payloadManager.getMasterCollection();
    const historyMap = this.application.historyManager.getHistoryMapCopy();
    const note = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;
    const decryptedPayload = note.payload;
    const decryptedPayloads = [decryptedPayload];
    const response = new SyncResponse({
      retrieved_items: [decryptedPayload],
    });
    const resolver = new SyncResponseResolver(
      response,
      decryptedPayloads,
      masterCollection,
      [],
      historyMap
    );
    const collections = await resolver.collectionsByProcessingResponse();
    for (const collection of collections) {
      if (collection.source === PayloadSource.RemoteRetrieved) {
        expect(collection.all().length).to.equal(0);
      }
    }
  });

  it('retrieved items should have both updated_at and updated_at_timestamps', async function () {
    const note = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;
    expect(note.payload.created_at_timestamp).to.be.ok;
    expect(note.payload.created_at).to.be.ok;
    expect(note.payload.updated_at_timestamp).to.be.ok;
    expect(note.payload.updated_at).to.be.ok;
  });

  it('should use latest value of item when performing second page of sync', async function () {
    /**
     * If 151 items are set to sync, and the per page limit is 150, then the 151st item
     * will be queued to sync after the first page completes. We want to make sure that
     * in the second sync, the latest value of the 151st item is used, and not its value
     * when it was first marked as dirty
     */
    const noteCount = 3;
    await Factory.createManyMappedNotes(this.application, noteCount);
    this.expectedItemCount += noteCount;
    this.application.syncService.upDownLimit = noteCount - 1;
    const dirtyItems = this.application.syncService.itemsNeedingSync();
    expect(dirtyItems.length).to.equal(noteCount);
    const lastItemUuid = dirtyItems[dirtyItems.length - 1].uuid;
    let syncCount = 0;
    this.application.addSingleEventObserver(
      ApplicationEvent.WillSync,
      async () => {
        /** Modify the last item. Change the deleted value so that this value
         * can be easily checked on saved_items response */
        if (syncCount === 0) {
          await this.application.itemManager.setItemToBeDeleted(lastItemUuid);
          this.expectedItemCount--;
        }
      }
    );

    let testDidExcute = false;
    this.application.syncService.addEventObserver((eventName, data) => {
      if (eventName === SyncEvent.SingleSyncCompleted) {
        if (syncCount === 1) {
          const matchingPayload = data.savedPayloads.find(
            (p) => p.uuid === lastItemUuid
          );
          expect(matchingPayload.deleted).to.equal(true);
          testDidExcute = true;
        }
        syncCount++;
      }
    });

    await this.application.sync();
    expect(testDidExcute).to.equal(true);
  });
});
