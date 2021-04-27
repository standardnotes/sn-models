/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
import * as Factory from './lib/factory.js';
import WebDeviceInterface from './lib/web_device_interface.js';
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('singletons', function () {
  this.timeout(Factory.TestTimeout);

  const syncOptions = {
    checkIntegrity: true,
  };
  const BASE_ITEM_COUNT = 2; /** Default items key, user preferences */

  function createPrefsPayload() {
    const params = {
      uuid: Uuid.GenerateUuidSynchronously(),
      content_type: ContentType.UserPrefs,
      content: {
        foo: 'bar',
      },
    };
    return CreateMaxPayloadFromAnyObject(params);
  }

  function findOrCreatePrefsSingleton(application) {
    return application.singletonManager.findOrCreateSingleton(
      new SNPredicate('content_type', '=', ContentType.UserPrefs),
      ContentType.UserPrefs,
      FillItemContent({})
    );
  }

  beforeEach(async function () {
    localStorage.clear();
    this.expectedItemCount = BASE_ITEM_COUNT;
    this.application = await Factory.createInitAppWithRandNamespace();
    this.email = Uuid.GenerateUuidSynchronously();
    this.password = Uuid.GenerateUuidSynchronously();
    this.registerUser = async () => {
      await Factory.registerUserToApplication({
        application: this.application,
        email: this.email,
        password: this.password,
      });
    };
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
    this.extManagerId = 'org.standardnotes.extensions-manager';
    this.extPred = SNPredicate.CompoundPredicate([
      new SNPredicate('content_type', '=', ContentType.Component),
      new SNPredicate('package_info.identifier', '=', this.extManagerId),
    ]);
    this.createExtMgr = async () => {
      return this.application.createManagedItem(
        ContentType.Component,
        {
          package_info: {
            name: 'Extensions',
            identifier: this.extManagerId,
          },
        },
        true
      );
    };
  });

  afterEach(async function () {
    expect(this.application.syncService.isOutOfSync()).to.equal(false);
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(this.expectedItemCount);
    await this.application.deinit();
    localStorage.clear();
  });

  it(`only resolves to ${BASE_ITEM_COUNT} items`, async function () {
    /** Preferences are an item we know to always return true for isSingleton */
    const prefs1 = createPrefsPayload();
    const prefs2 = createPrefsPayload();
    const prefs3 = createPrefsPayload();

    const items = await this.application.itemManager.emitItemsFromPayloads(
      [prefs1, prefs2, prefs3],
      PayloadSource.LocalChanged
    );
    await this.application.itemManager.setItemsDirty(Uuids(items));
    await this.application.syncService.sync(syncOptions);
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
  });

  it('resolves registered predicate', async function () {
    this.application.singletonManager.registerPredicate(this.extPred);
    const extManager = await this.createExtMgr();
    this.expectedItemCount += 1;

    /** Call needlessly */
    await this.createExtMgr();
    await this.createExtMgr();
    await this.createExtMgr();

    expect(extManager).to.be.ok;
    const refreshedExtMgr = this.application.findItem(extManager.uuid);
    expect(refreshedExtMgr).to.be.ok;
    await this.application.sync(syncOptions);
    expect(
      this.application.itemManager.itemsMatchingPredicate(this.extPred).length
    ).to.equal(1);
  });

  it('resolves via find or create', async function () {
    /* Set to never synced as singleton manager will attempt to sync before resolving */
    this.application.syncService.ut_clearLastSyncDate();
    this.application.syncService.ut_setDatabaseLoaded(false);
    const contentType = ContentType.UserPrefs;
    const predicate = new SNPredicate('content_type', '=', contentType);
    /* Start a sync right after we await singleton resolve below */
    setTimeout(() => {
      this.application.syncService.ut_setDatabaseLoaded(true);
      this.application.sync({
        /* Simulate the first sync occuring as that is handled specially by sync service */
        mode: SyncModes.DownloadFirst,
      });
    });
    const userPreferences = await this.application.singletonManager.findOrCreateSingleton(
      predicate,
      contentType,
      {}
    );

    expect(userPreferences).to.be.ok;
    const refreshedUserPrefs = this.application.findItem(userPreferences.uuid);
    expect(refreshedUserPrefs).to.be.ok;
    await this.application.sync(syncOptions);
    expect(
      this.application.itemManager.itemsMatchingPredicate(predicate).length
    ).to.equal(1);
  });

  it('resolves registered predicate with signing in/out', async function () {
    await this.registerUser();
    await this.signOut();
    this.email = Uuid.GenerateUuidSynchronously();
    this.password = Uuid.GenerateUuidSynchronously();
    this.application.singletonManager.registerPredicate(this.extPred);
    await this.createExtMgr();
    this.expectedItemCount += 1;
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });
    await this.signOut();
    this.application.singletonManager.registerPredicate(this.extPred);
    await this.createExtMgr();
    await this.application.sync(syncOptions);
    this.application.sync(syncOptions);
    await this.signIn();
    await Factory.sleep(0.5);
  });

  it('singletons that are deleted after download first sync should not sync to server', async function () {
    await this.registerUser();
    this.application.singletonManager.registerPredicate(this.extPred);
    await this.createExtMgr();
    await this.createExtMgr();
    await this.createExtMgr();
    this.expectedItemCount++;

    let didCompleteRelevantSync = false;
    let beginCheckingResponse = false;
    this.application.syncService.addEventObserver(async (eventName, data) => {
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
        const saved = data.savedPayloads;
        expect(saved.length).to.equal(1);
        const matching = saved.find(
          (p) => p.content_type === ContentType.Component && p.deleted
        );
        expect(matching).to.not.be.ok;
      }
    });
    await this.application.syncService.sync({ mode: SyncModes.DownloadFirst });
    expect(didCompleteRelevantSync).to.equal(true);
  }).timeout(10000);

  it.only('signing into account and retrieving singleton shouldnt put us in deadlock', async function () {
    await this.registerUser();
    /** Create prefs */
    const ogPrefs = await findOrCreatePrefsSingleton(this.application);
    await this.application.sync(syncOptions);
    this.application = await Factory.signOutApplicationAndReturnNew(
      this.application
    );
    /** Create another instance while signed out */
    await findOrCreatePrefsSingleton(this.application);
    await Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });
    /** After signing in, the instance retrieved from the server should be the one kept */
    const latestPrefs = await findOrCreatePrefsSingleton(this.application);
    expect(latestPrefs.uuid).to.equal(ogPrefs.uuid);
    const allPrefs = this.application.itemManager.nonErroredItemsForContentType(
      ogPrefs.content_type
    );
    expect(allPrefs.length).to.equal(1);
  });

  it('resolving singleton before first sync, then signing in, should result in correct number of instances', async function () {
    await this.registerUser();
    /** Create prefs and associate them with account */
    const ogPrefs = await findOrCreatePrefsSingleton(this.application);
    await this.application.sync(syncOptions);
    this.application = await Factory.signOutApplicationAndReturnNew(
      this.application
    );

    /** Create another instance while signed out */
    await findOrCreatePrefsSingleton(this.application);
    await Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });
    /** After signing in, the instance retrieved from the server should be the one kept */
    const latestPrefs = await findOrCreatePrefsSingleton(this.application);
    expect(latestPrefs.uuid).to.equal(ogPrefs.uuid);
    const allPrefs = this.application.itemManager.nonErroredItemsForContentType(
      ogPrefs.content_type
    );
    expect(allPrefs.length).to.equal(1);
  });

  it('if only result is errorDecrypting, create new item', async function () {
    const item = this.application.itemManager.items.find(
      (item) => item.content_type === ContentType.UserPrefs
    );
    await this.application.itemManager.changeItem(item.uuid, (mutator) => {
      mutator.errorDecrypting = true;
    });

    const predicate = new SNPredicate('content_type', '=', item.content_type);
    const resolvedItem = await this.application.singletonManager.findOrCreateSingleton(
      predicate,
      item.content_type,
      item.content
    );
    await this.application.sync({ awaitAll: true });
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    expect(resolvedItem.uuid).to.not.equal(item.uuid);
    expect(resolvedItem.errorDecrypting).to.not.be.ok;
  });

  it('if two items and one is error decrypting, should resolve after download first sync', async function () {
    /**
     * While signing in, a singleton item may be inserted that hasn't yet had the chance to decrypt
     * When the singleton logic runs, it will ignore this item, and matching singletons will result
     * in just 1, meaning the two items will not be consolidated. We want to make sure that when the item
     * is then subsequently decrypted, singleton logic runs again for the item.
     */

    this.application.singletonManager.registerPredicate(this.extPred);

    await this.application.createManagedItem(
      ContentType.Component,
      {
        package_info: {
          name: 'Extensions',
          identifier: this.extManagerId,
        },
      },
      true,
      {
        errorDecrypting: false,
      }
    );

    const errored = await this.application.createManagedItem(
      ContentType.Component,
      {
        package_info: {
          name: 'Extensions',
          identifier: this.extManagerId,
        },
      },
      true,
      {
        errorDecrypting: true,
      }
    );

    this.expectedItemCount += 1;
    await this.application.sync(syncOptions);
    /** Now mark errored as not errorDecrypting and sync */
    const notErrored = CreateMaxPayloadFromAnyObject(errored, {
      errorDecrypting: false,
      errorDecryptingValueChanged: true,
    });
    await this.application.payloadManager.emitPayload(notErrored);
    /** Item will get decrypted on current tick, so wait one before syncing */
    await Factory.sleep(0);
    await this.application.syncService.sync(syncOptions);

    expect(
      this.application.itemManager.itemsMatchingPredicate(this.extPred).length
    ).to.equal(1);
  });

  it('alternating the uuid of a singleton should return correct result', async function () {
    const payload = createPrefsPayload();
    const item = await this.application.itemManager.emitItemFromPayload(
      payload,
      PayloadSource.LocalChanged
    );
    await this.application.syncService.sync(syncOptions);
    const predicate = new SNPredicate('content_type', '=', item.content_type);
    let resolvedItem = await this.application.singletonManager.findOrCreateSingleton(
      predicate,
      payload.content_type,
      payload.content
    );
    const originalUuid = resolvedItem.uuid;
    await this.application.syncService.alternateUuidForItem(resolvedItem.uuid);
    await this.application.syncService.sync(syncOptions);
    const resolvedItem2 = await this.application.singletonManager.findOrCreateSingleton(
      predicate,
      payload.content_type,
      payload.content
    );
    resolvedItem = this.application.findItem(resolvedItem.uuid);
    expect(resolvedItem).to.not.be.ok;
    expect(resolvedItem2.uuid).to.not.equal(originalUuid);
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
  });
});
