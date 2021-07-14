import {
  Platform,
  Environment,
  DeinitSource,
} from '@Lib/index';
import * as Factory from './../factory';
import {
  createNoteItem,
} from '../helpers';

const syncOptions = {
  checkIntegrity: true,
  awaitAll: true,
};

describe('application instances', () => {
  const BASE_ITEM_COUNT = 2; /** Default items key, user preferences */

  it('two distinct applications should not share model manager state', async () => {
    const app1 = await Factory.createAndInitializeApplication('app1');
    const app2 = await Factory.createAndInitializeApplication('app2');
    expect(app1.payloadManager).toBe(app1.payloadManager);
    expect(app1.payloadManager).not.toBe(app2.payloadManager);

    await Factory.createMappedNote(app1);
    expect(app1.itemManager.items.length).toBe(BASE_ITEM_COUNT + 1);
    expect(app2.itemManager.items.length).toBe(BASE_ITEM_COUNT);
    await app1.deinit();
    await app2.deinit();
  });

  it('two distinct applications should not share storage manager state', async () => {
    const app1 = await Factory.createAndInitializeApplication('app1');
    const app2 = await Factory.createAndInitializeApplication('app2');

    await Factory.createMappedNote(app1);
    await app1.syncService.sync(syncOptions);

    expect(
      (await app1.storageService.getAllRawPayloads()).length
    ).toBe(BASE_ITEM_COUNT + 1);
    expect(
      (await app2.storageService.getAllRawPayloads()).length
    ).toBe(BASE_ITEM_COUNT);

    await Factory.createMappedNote(app2);
    await app2.syncService.sync(syncOptions);

    expect(
      (await app1.storageService.getAllRawPayloads()).length
    ).toBe(BASE_ITEM_COUNT + 1);
    expect(
      (await app2.storageService.getAllRawPayloads()).length
    ).toBe(BASE_ITEM_COUNT + 1);
    await app1.deinit();
    await app2.deinit();
  });

  it('deinit application while storage persisting should be handled gracefully', async () => {
    /** This test will always succeed but should be observed for console exceptions */
    const app = await Factory.createAndInitializeApplication('app');
    /** Don't await */
    app.storageService.persistValuesToDisk();
    await app.prepareForDeinit();
    app.deinit();
  });

  it('signing out application should delete snjs_version', async () => {
    const identifier = 'app';
    const app = await Factory.createAndInitializeApplication(identifier);
    expect(await app.deviceInterface.getRawStorageValue(`${identifier}-snjs_version`)).toBeTruthy();
    await app.signOut();
    expect(await app.deviceInterface.getRawStorageValue(`${identifier}-snjs_version`)).toBeFalsy();
  });

  it('locking application while critical func in progress should wait up to a limit', async () => {
    /** This test will always succeed but should be observed for console exceptions */
    const app = await Factory.createAndInitializeApplication('app');
    /** Don't await */
    const MaximumWaitTime = 0.5;
    app.storageService.executeCriticalFunction(async () => {
      /** If we sleep less than the maximum, locking should occur safely.
       * If we sleep more than the maximum, locking should occur with exception on
       * app deinit. */
      await Factory.sleep(MaximumWaitTime - 0.05);
      /** Access any deviceInterface function */
      app.storageService.deviceInterface.getAllRawDatabasePayloads(
        app.identifier
      );
    });
    await app.lock();
  });

  describe('signOut()', () => {
    let testNote1;
    let confirmAlert;
    let deinit;
    let testSNApp;

    beforeEach(async () => {
      testSNApp = await Factory.createAndInitializeApplication('test-application');
    });

    const signOutConfirmMessage = (numberOfItems) => {
      const singular = numberOfItems === 1;
      return (
        `There ${singular ? 'is' : 'are'} ${numberOfItems} ${
          singular ? 'item' : 'items'
        } with unsynced changes. ` +
        'If you sign out, these changes will be lost forever. Are you sure you want to sign out?'
      );
    };

    beforeEach(async () => {
      testNote1 = await createNoteItem(testSNApp, {
        title: 'Note 1',
        text: 'This is a test note!'
      });
      confirmAlert = jest.spyOn(
        testSNApp.alertService,
        'confirm'
      );
      deinit = jest.spyOn(
        testSNApp,
        'deinit'
      );
    });

    it('shows confirmation dialog when there are unsaved changes', async () => {
      await testSNApp.itemManager.setItemDirty(testNote1.uuid);
      await testSNApp.signOut();

      const expectedConfirmMessage = signOutConfirmMessage(1);

      expect(confirmAlert).toBeCalledTimes(1);
      expect(confirmAlert).toBeCalledWith(expectedConfirmMessage);
      expect(deinit).toBeCalledTimes(1);
      expect(deinit).toBeCalledWith(DeinitSource.SignOut);
    });

    it('does not show confirmation dialog when there are no unsaved changes', async () => {
      await testSNApp.signOut();

      expect(confirmAlert).toBeCalledTimes(0);
      expect(deinit).toBeCalledTimes(1);
      expect(deinit).toBeCalledWith(DeinitSource.SignOut);
    });

    it('does not show confirmation dialog when there are unsaved changes and the "force" option is set to true', async () => {
      await testSNApp.itemManager.setItemDirty(testNote1.uuid);
      await testSNApp.signOut(true);

      expect(confirmAlert).toBeCalledTimes(0);
      expect(deinit).toBeCalledTimes(1);
      expect(deinit).toBeCalledWith(DeinitSource.SignOut);
    });

    it('cancels sign out if confirmation dialog is rejected', async () => {
      confirmAlert.mockImplementation((message) => false);

      await testSNApp.itemManager.setItemDirty(testNote1.uuid);
      await testSNApp.signOut();

      const expectedConfirmMessage = signOutConfirmMessage(1);

      expect(confirmAlert).toBeCalledTimes(1);
      expect(confirmAlert).toBeCalledWith(expectedConfirmMessage);
      expect(deinit).toBeCalledTimes(0);
    });
  });
});
