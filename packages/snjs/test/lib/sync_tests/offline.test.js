import { ContentType } from '@Lib/models';
import * as Factory from '../../factory';

describe('offline syncing', () => {
  const BASE_ITEM_COUNT = 2; /** Default items key, user preferences */

  const syncOptions = {
    checkIntegrity: true,
    awaitAll: true,
  };

  let expectedItemCount;
  let application;

  beforeEach(async function () {
    expectedItemCount = BASE_ITEM_COUNT;
    application = await Factory.createInitAppWithRandNamespace();
  });

  afterEach(async function () {
    expect(application.syncService.isOutOfSync()).toBe(false);
    application.deinit();
  });

  it('should sync item with no passcode', async function () {
    let note = await Factory.createMappedNote(application);
    expect(application.itemManager.getDirtyItems().length).toBe(1);
    const rawPayloads1 = await application.storageService.getAllRawPayloads();
    expect(rawPayloads1.length).toBe(expectedItemCount);

    await application.syncService.sync(syncOptions);
    note = application.findItem(note.uuid);
    /** In rare cases a sync can complete so fast that the dates are equal; this is ok. */
    expect(note.lastSyncEnd.getTime()).toBeGreaterThanOrEqual(note.lastSyncBegan.getTime());
    expectedItemCount++;

    expect(application.itemManager.getDirtyItems().length).toBe(0);
    const rawPayloads2 = await application.storageService.getAllRawPayloads();
    expect(rawPayloads2.length).toBe(expectedItemCount);

    const itemsKeyRP = (
      await Factory.getStoragePayloadsOfType(
        application,
        ContentType.ItemsKey
      )
    )[0];
    const noteRP = (
      await Factory.getStoragePayloadsOfType(application, ContentType.Note)
    )[0];

    /** Encrypts with default items key */
    expect(typeof noteRP.content).toBe('string');
    /** Not encrypted as no passcode/root key */
    expect(typeof itemsKeyRP.content).toBe('object');
  });

  it('should sync item encrypted with passcode', async function () {
    await application.addPasscode('foobar');
    await Factory.createMappedNote(application);
    expect(application.itemManager.getDirtyItems().length).toBe(1);
    const rawPayloads1 = await application.storageService.getAllRawPayloads();
    expect(rawPayloads1.length).toBe(expectedItemCount);

    await application.syncService.sync(syncOptions);
    expectedItemCount++;

    expect(application.itemManager.getDirtyItems().length).toBe(0);
    const rawPayloads2 = await application.storageService.getAllRawPayloads();
    expect(rawPayloads2.length).toBe(expectedItemCount);

    const payload = rawPayloads2[0];
    expect(typeof payload.content).toBe('string');
    expect(
      payload.content.startsWith(
        application.protocolService.getLatestVersion()
      )
    ).toBe(true);
  });

  it('signing out while offline should succeed', async function () {
    await Factory.createMappedNote(application);
    expectedItemCount++;
    await application.syncService.sync(syncOptions);
    application = await Factory.signOutApplicationAndReturnNew(
      application
    );
    expect(application.noAccount()).toBe(true);
    expect(application.getUser()).toBeFalsy();
  });
});
