/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
import * as Factory from './lib/factory.js';
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('auth fringe cases', () => {
  const BASE_ITEM_COUNT = ['default items key', 'user prefs'].length;

  const createContext = async () => {
    const application = await Factory.createInitAppWithRandNamespace();
    return {
      expectedItemCount: BASE_ITEM_COUNT,
      application: application,
      email: Uuid.GenerateUuidSynchronously(),
      password: Uuid.GenerateUuidSynchronously(),
      deinit: () => {
        application.deinit();
      },
    };
  };

  beforeEach(async function () {
    localStorage.clear();
  });

  afterEach(async function () {
    localStorage.clear();
  });

  const clearApplicationLocalStorage = function () {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (!key.toLowerCase().includes('item')) {
        localStorage.removeItem(key);
      }
    }
  };

  const awaitSync = true;

  describe('localStorage improperly cleared with 1 item', function () {
    it('item should be errored', async function () {
      const context = await createContext();
      await context.application.register(context.email, context.password);
      const note = await Factory.createSyncedNote(context.application);
      clearApplicationLocalStorage();
      console.warn(
        "Expecting errors 'Unable to find operator for version undefined'"
      );
      const restartedApplication = await Factory.restartApplication(
        context.application
      );
      const refreshedNote = restartedApplication.itemManager.findItem(
        note.uuid
      );
      expect(refreshedNote.errorDecrypting).to.equal(true);
      restartedApplication.deinit();
    });

    it('signing in again should decrypt item', async function () {
      const context = await createContext();
      await context.application.register(context.email, context.password);
      const note = await Factory.createSyncedNote(context.application);
      clearApplicationLocalStorage();
      const restartedApplication = await Factory.restartApplication(
        context.application
      );
      console.warn(
        "Expecting errors 'No associated key found for item encrypted with latest protocol version.'",
        "and 'Unable to find operator for version undefined'"
      );
      await restartedApplication.signIn(
        context.email,
        context.password,
        undefined,
        undefined,
        undefined,
        awaitSync
      );
      const refreshedNote = restartedApplication.itemManager.findItem(
        note.uuid
      );
      expect(refreshedNote.errorDecrypting).to.equal(false);
      expect(restartedApplication.itemManager.notes.length).to.equal(1);
      restartedApplication.deinit();
    }).timeout(10000);
  });

  describe('having offline item matching remote item uuid', function () {
    it('offline item should not overwrite recently updated server item and conflict should be created', async function () {
      const context = await createContext();
      await context.application.register(context.email, context.password);
      const staleText = 'stale text';
      const firstVersionOfNote = await Factory.createSyncedNote(
        context.application,
        undefined,
        staleText
      );
      const serverText = 'server text';
      await context.application.changeAndSaveItem(
        firstVersionOfNote.uuid,
        (mutator) => {
          mutator.text = serverText;
        }
      );
      const newApplication = await Factory.signOutApplicationAndReturnNew(
        context.application
      );
      /** Create same note but now offline */
      await newApplication.itemManager.emitItemFromPayload(
        firstVersionOfNote.payload
      );

      /** Sign in and merge local data */
      await newApplication.signIn(
        context.email,
        context.password,
        undefined,
        undefined,
        true,
        true
      );

      expect(newApplication.itemManager.notes.length).to.equal(2);

      expect(
        newApplication.itemManager.notes.find(
          (n) => n.uuid === firstVersionOfNote.uuid
        ).text
      ).to.equal(staleText);

      const conflictedCopy = newApplication.itemManager.notes.find(
        (n) => n.uuid !== firstVersionOfNote.uuid
      );
      expect(conflictedCopy.text).to.equal(serverText);
      expect(conflictedCopy.duplicate_of).to.equal(firstVersionOfNote.uuid);
      newApplication.deinit();
    }).timeout(10000);
  });
});
