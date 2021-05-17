/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
import WebDeviceInterface from './web_device_interface.js';

export const TestTimeout = 10000;
export const LongTestTimeout = 20000;

const syncOptions = {
  checkIntegrity: true,
  awaitAll: true,
};

export async function createAppContext(identifier) {
  if (!identifier) {
    identifier = `${Math.random()}`;
  }
  const application = await createApplication(identifier);
  const email = Uuid.GenerateUuidSynchronously();
  const password = Uuid.GenerateUuidSynchronously();
  const passcode = 'mypasscode';
  const handleChallenge = (challenge) => {
    const responses = [];
    for (const prompt of challenge.prompts) {
      if (prompt.validation === ChallengeValidation.LocalPasscode) {
        responses.push(new ChallengeValue(prompt, passcode));
      } else if (prompt.validation === ChallengeValidation.AccountPassword) {
        responses.push(new ChallengeValue(prompt, password));
      } else if (
        prompt.validation === ChallengeValidation.ProtectionSessionDuration
      ) {
        responses.push(new ChallengeValue(prompt, 0));
      } else if (prompt.placeholder === 'Email') {
        responses.push(new ChallengeValue(prompt, email));
      } else if (prompt.placeholder === 'Password') {
        responses.push(new ChallengeValue(prompt, password));
      } else {
        throw Error(`Unhandled custom challenge in Factory.createAppContext`);
      }
    }
    application.submitValuesForChallenge(challenge, responses);
  };
  return {
    application: application,
    email,
    identifier,
    password,
    passcode,
    awaitNextSucessfulSync: () => {
      return new Promise((resolve) => {
        const removeObserver = application.syncService.addEventObserver(
          (event) => {
            if (event === SyncEvent.FullSyncCompleted) {
              removeObserver();
              resolve();
            }
          }
        );
      });
    },
    launch: async ({ awaitDatabaseLoad = true } = {}) => {
      await application.prepareForLaunch({
        receiveChallenge: handleChallenge,
      });
      await application.launch(awaitDatabaseLoad);
    },
    handleChallenge,
    deinit: () => {
      application.deinit();
    },
  };
}

export function getDefaultHost() {
  // API Gateway
  return 'http://localhost:3124';
}

export function createApplication(identifier, environment, platform) {
  const deviceInterface = new WebDeviceInterface(
    setTimeout.bind(window),
    setInterval.bind(window)
  );
  return new SNApplication(
    environment || Environment.Web,
    platform || Platform.MacWeb,
    deviceInterface,
    new SNWebCrypto(),
    {
      confirm: async () => true,
      alert: async () => {},
      blockingDialog: () => () => {},
    },
    identifier || `${Math.random()}`,
    [],
    getDefaultHost()
  );
}

export async function createAppWithRandNamespace(environment, platform) {
  const namespace = Math.random().toString(36).substring(2, 15);
  return createApplication(namespace, environment, platform);
}

export async function createInitAppWithRandNamespace(environment, platform) {
  const namespace = Math.random().toString(36).substring(2, 15);
  return createAndInitializeApplication(namespace, environment, platform);
}

export async function createAndInitializeApplication(
  namespace,
  environment,
  platform
) {
  const application = createApplication(namespace, environment, platform);
  await initializeApplication(application);
  return application;
}

export async function initializeApplication(application) {
  await application.prepareForLaunch({
    receiveChallenge: (challenge) => {
      if (challenge.reason !== ChallengeReason.Custom) {
        throw Error("Factory application shouldn't have challenges");
      }
    },
  });
  await application.launch(true);
}

export async function registerUserToApplication({
  application,
  email,
  password,
  ephemeral,
  mergeLocal = true,
}) {
  if (!email) email = generateUuid();
  if (!password) password = generateUuid();
  return application.register(email, password, ephemeral, mergeLocal);
}

export async function setOldVersionPasscode({
  application,
  passcode,
  version,
}) {
  const identifier = await application.protocolService.crypto.generateUUID();
  const operator = application.protocolService.operatorForVersion(version);
  const key = await operator.createRootKey(
    identifier,
    passcode,
    KeyParamsOrigination.PasscodeCreate
  );
  await application.protocolService.setNewRootKeyWrapper(key);
  await application.credentialService.rewriteItemsKeys();
  await application.syncService.sync(syncOptions);
}

/**
 * Using application.register will always use latest version of protocol.
 * To use older version, use this method.
 */
export async function registerOldUser({
  application,
  email,
  password,
  version,
}) {
  if (!email) email = generateUuid();
  if (!password) password = generateUuid();
  const operator = application.protocolService.operatorForVersion(version);
  const accountKey = await operator.createRootKey(
    email,
    password,
    KeyParamsOrigination.Registration
  );

  const response = await application.apiService.register(
    email,
    accountKey.serverPassword,
    accountKey.keyParams
  );
  /** Mark all existing items as dirty. */
  await application.itemManager.changeItems(
    Uuids(application.itemManager.items),
    (m) => {
      m.dirty = true;
    }
  );
  await application.sessionManager.handleSuccessAuthResponse(
    response,
    accountKey
  );
  application.notifyEvent(ApplicationEvent.SignedIn);
  await application.syncService.sync({
    mode: SyncModes.DownloadFirst,
    ...syncOptions,
  });
  await application.protocolService.decryptErroredItems();
}

export function createStorageItemPayload(contentType) {
  return CreateMaxPayloadFromAnyObject(createItemParams(contentType));
}

export function createNotePayload(title, text = undefined) {
  return CreateMaxPayloadFromAnyObject(createNoteParams({ title, text }));
}

export function createStorageItemTagPayload() {
  return CreateMaxPayloadFromAnyObject(createTagParams());
}

export function itemToStoragePayload(item) {
  return CreateMaxPayloadFromAnyObject(item);
}

export function createMappedNote(application) {
  const payload = createNotePayload();
  return application.itemManager.emitItemFromPayload(
    payload,
    PayloadSource.LocalChanged
  );
}

export function createMappedTag(application) {
  const payload = createStorageItemTagPayload();
  return application.itemManager.emitItemFromPayload(
    payload,
    PayloadSource.LocalChanged
  );
}

export async function createSyncedNote(application, title, text) {
  const payload = createNotePayload(title, text);
  await application.itemManager.emitItemFromPayload(
    payload,
    PayloadSource.LocalChanged
  );
  await application.itemManager.setItemDirty(payload.uuid);
  await application.syncService.sync(syncOptions);
  const note = application.findItem(payload.uuid);
  return note;
}

export async function getStoragePayloadsOfType(application, type) {
  const rawPayloads = await application.storageService.getAllRawPayloads();
  return rawPayloads
    .filter((rp) => rp.content_type === type)
    .map((rp) => {
      return CreateMaxPayloadFromAnyObject(rp);
    });
}

export async function createManyMappedNotes(application, count) {
  const createdNotes = [];
  for (let i = 0; i < count; i++) {
    const note = await createMappedNote(application);
    await application.itemManager.setItemDirty(note.uuid);
    createdNotes.push(note);
  }
  return createdNotes;
}

export async function loginToApplication({
  application,
  email,
  password,
  ephemeral,
  mergeLocal = true,
}) {
  return application.signIn(
    email,
    password,
    undefined,
    ephemeral,
    mergeLocal,
    true
  );
}

/**
 * Signing out of an application deinits it.
 * A new one must be created.
 */
export async function signOutApplicationAndReturnNew(application) {
  await application.signOut();
  return createInitAppWithRandNamespace();
}

export async function signOutAndBackIn(application, email, password) {
  await application.signOut();
  const newApplication = await createInitAppWithRandNamespace();
  await this.loginToApplication({
    application: newApplication,
    email,
    password,
  });
  return newApplication;
}

export async function restartApplication(application) {
  const id = application.identifier;
  await application.deinit();
  const newApplication = await createAndInitializeApplication(id);
  return newApplication;
}

export function createItemParams(contentType) {
  const params = {
    uuid: generateUuid(),
    content_type: contentType,
    content: {
      title: 'hello',
      text: 'world',
    },
  };
  return params;
}

export function generateUuid() {
  const crypto = new SNWebCrypto();
  return crypto.generateUUIDSync();
}

export function createNoteParams({ title, text, dirty = true } = {}) {
  const params = {
    uuid: generateUuid(),
    content_type: ContentType.Note,
    dirty: dirty,
    content: {
      title: title || 'hello',
      text: text || 'world',
      references: [],
    },
  };
  return params;
}

export function createTagParams({ dirty = true } = {}) {
  const params = {
    uuid: generateUuid(),
    content_type: ContentType.Tag,
    dirty: dirty,
    content: {
      title: 'thoughts',
      references: [],
    },
  };
  return params;
}

export function createRelatedNoteTagPairPayload({ dirty = true } = {}) {
  const noteParams = createNoteParams({ dirty });
  const tagParams = createTagParams({ dirty });
  tagParams.content.references = [
    {
      uuid: noteParams.uuid,
      content_type: noteParams.content_type,
    },
  ];
  noteParams.content.references = [];
  return [
    CreateMaxPayloadFromAnyObject(noteParams),
    CreateMaxPayloadFromAnyObject(tagParams),
  ];
}

export async function createSyncedNoteWithTag(application) {
  const payloads = createRelatedNoteTagPairPayload();
  await application.itemManager.emitItemsFromPayloads(payloads);
  return application.sync(syncOptions);
}

export async function storagePayloadCount(application) {
  const payloads = await application.storageService.getAllRawPayloads();
  return payloads.length;
}

export function yesterday() {
  return new Date(new Date().setDate(new Date().getDate() - 1));
}

export function dateToMicroseconds(date) {
  return date.getTime() * 1_000;
}

export function tomorrow() {
  return new Date(new Date().setDate(new Date().getDate() + 1));
}

export async function sleep(seconds) {
  console.warn(`Test sleeping for ${seconds}s`);
  return new Promise((resolve, reject) => {
    setTimeout(function () {
      resolve();
    }, seconds * 1000);
  });
}

export function shuffleArray(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomString(length = 10) {
  let result = '';
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export function generateUuidish() {
  return this.randomString(32);
}

export function randomArrayValue(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export async function expectThrowsAsync(method, errorMessage) {
  let error = null;
  try {
    await method();
  } catch (err) {
    error = err;
  }
  const expect = chai.expect;
  expect(error).to.be.an('Error');
  if (errorMessage) {
    expect(error.message)
      .to.be.a('string')
      .and.satisfy((msg) => msg.startsWith(errorMessage));
  }
}

export function ignoreChallenges(application) {
  application.setLaunchCallback({
    receiveChallenge() {
      /** no-op */
    },
  });
}

export function handlePasswordChallenges(application, password) {
  application.setLaunchCallback({
    receiveChallenge: (challenge) => {
      const values = challenge.prompts.map(
        (prompt) =>
          new ChallengeValue(
            prompt,
            prompt.validation === ChallengeValidation.ProtectionSessionDuration
              ? 0
              : password
          )
      );
      application.submitValuesForChallenge(challenge, values);
    },
  });
}
