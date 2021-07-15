import { CopyPayload } from '@Lib/index';
import { ContentType } from '@Lib/models';
import { EncryptionIntent } from '@Lib/protocol';
import { Uuid } from '@Lib/uuid';
import * as Factory from '../factory';

describe('backups', function () {
  const BASE_ITEM_COUNT_ENCRYPTED = ['ItemsKey', 'UserPreferences'].length;
  const BASE_ITEM_COUNT_DECRYPTED = ['UserPreferences'].length;

  it('backup file should have a version number', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    let data = await application.createBackupFile(
      EncryptionIntent.FileDecrypted
    );
    expect(data.version).toBe(application.protocolService.getLatestVersion());
    await application.addPasscode('passcode');
    data = await application.createBackupFile(
      EncryptionIntent.FileEncrypted
    );
    expect(data.version).toBe(application.protocolService.getLatestVersion());
  });

  it('no passcode + no account backup file should have correct number of items', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    await Promise.all([
      Factory.createSyncedNote(application),
      Factory.createSyncedNote(application),
    ]);
    const data = await application.createBackupFile(
      EncryptionIntent.FileDecrypted
    );
    expect(data.items.length).toBe(BASE_ITEM_COUNT_DECRYPTED + 2);
  });

  it('passcode + no account backup file should have correct number of items', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    const passcode = 'passcode';
    await application.addPasscode(passcode);
    await Promise.all([
      Factory.createSyncedNote(application),
      Factory.createSyncedNote(application),
    ]);

    // Encrypted backup without authorization
    const encryptedData = await application.createBackupFile(
      EncryptionIntent.FileEncrypted
    );
    expect(encryptedData.items.length).toBe(BASE_ITEM_COUNT_ENCRYPTED + 2);

    // Encrypted backup with authorization
    Factory.handlePasswordChallenges(application, passcode);
    const authorizedEncryptedData = await application.createBackupFile(
      EncryptionIntent.FileEncrypted,
      true
    );
    expect(authorizedEncryptedData.items.length).toBe(BASE_ITEM_COUNT_ENCRYPTED + 2);
  });

  it('no passcode + account backup file should have correct number of items', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    const email = Uuid.GenerateUuidSynchronously();
    const password = Uuid.GenerateUuidSynchronously();

    await Factory.registerUserToApplication({
      application: application,
      email: email,
      password: password,
    });
    await Promise.all([
      Factory.createSyncedNote(application),
      Factory.createSyncedNote(application),
    ]);

    // Encrypted backup without authorization
    const encryptedData = await application.createBackupFile(
      EncryptionIntent.FileEncrypted
    );
    expect(encryptedData.items.length).toBe(BASE_ITEM_COUNT_ENCRYPTED + 2);

    // Decrypted backup
    const decryptedData = await application.createBackupFile(
      EncryptionIntent.FileDecrypted
    );
    expect(decryptedData.items.length).toBe(BASE_ITEM_COUNT_DECRYPTED + 2);

    // Encrypted backup with authorization
    Factory.handlePasswordChallenges(application, password);
    const authorizedEncryptedData = await application.createBackupFile(
      EncryptionIntent.FileEncrypted,
      true
    );
    expect(authorizedEncryptedData.items.length).toBe(BASE_ITEM_COUNT_ENCRYPTED + 2);
  });

  it('passcode + account backup file should have correct number of items', async function () {
    jest.setTimeout(10000);

    const application = await Factory.createInitAppWithRandNamespace();
    const email = Uuid.GenerateUuidSynchronously();
    const password = Uuid.GenerateUuidSynchronously();

    const passcode = 'passcode';
    await application.register(email, password);
    Factory.handlePasswordChallenges(application, password);
    await application.addPasscode(passcode);
    await Promise.all([
      Factory.createSyncedNote(application),
      Factory.createSyncedNote(application),
    ]);

    // Encrypted backup without authorization
    const encryptedData = await application.createBackupFile(
      EncryptionIntent.FileEncrypted
    );
    expect(encryptedData.items.length).toBe(BASE_ITEM_COUNT_ENCRYPTED + 2);

    Factory.handlePasswordChallenges(application, passcode);

    // Decrypted backup
    const decryptedData = await application.createBackupFile(
      EncryptionIntent.FileDecrypted
    );
    expect(decryptedData.items.length).toBe(BASE_ITEM_COUNT_DECRYPTED + 2);

    // Encrypted backup with authorization
    const authorizedEncryptedData = await application.createBackupFile(
      EncryptionIntent.FileEncrypted,
      true
    );
    expect(authorizedEncryptedData.items.length).toBe(BASE_ITEM_COUNT_ENCRYPTED + 2);
  });

  it('backup file item should have correct fields', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    const email = Uuid.GenerateUuidSynchronously();
    const password = Uuid.GenerateUuidSynchronously();

    await Factory.createSyncedNote(application);
    let backupData = await application.createBackupFile(
      EncryptionIntent.FileDecrypted
    );
    let rawItem = backupData.items.find(
      (i) => i.content_type === ContentType.Note
    );

    expect(rawItem.fields).toBeFalsy();
    expect(rawItem.source).toBeFalsy();
    expect(rawItem.dirtiedDate).toBeFalsy();
    expect(rawItem.format).toBeFalsy();
    expect(rawItem.uuid).toBeTruthy();
    expect(rawItem.content_type).toBeTruthy();
    expect(rawItem.content).toBeTruthy();
    expect(rawItem.created_at).toBeTruthy();
    expect(rawItem.updated_at).toBeTruthy();

    await Factory.registerUserToApplication({
      application: application,
      email: email,
      password: password,
    });

    backupData = await application.createBackupFile(
      EncryptionIntent.FileEncrypted
    );
    rawItem = backupData.items.find((i) => i.content_type === ContentType.Note);

    expect(rawItem.fields).toBeFalsy();
    expect(rawItem.source).toBeFalsy();
    expect(rawItem.dirtiedDate).toBeFalsy();
    expect(rawItem.format).toBeFalsy();
    expect(rawItem.uuid).toBeTruthy();
    expect(rawItem.content_type).toBeTruthy();
    expect(rawItem.content).toBeTruthy();
    expect(rawItem.created_at).toBeTruthy();
    expect(rawItem.updated_at).toBeTruthy();
  });

  it('downloading backup if item is error decrypting should succeed', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    await Factory.createSyncedNote(application);

    const note = await Factory.createSyncedNote(application);
    const encrypted = await application.protocolService.payloadByEncryptingPayload(
      note.payload,
      EncryptionIntent.FileEncrypted
    );
    const errored = CopyPayload(encrypted, {
      errorDecrypting: true,
    });
    const erroredItem = await application.itemManager.emitItemFromPayload(
      errored
    );
    expect(erroredItem.errorDecrypting).toBe(true);
    const backupData = await application.createBackupFile(
      EncryptionIntent.FileDecrypted
    );

    expect(backupData.items.length).toBe(BASE_ITEM_COUNT_DECRYPTED + 2);
  });

  it('decrypted backup file should not have keyParams', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    const backup = await application.createBackupFile(
      EncryptionIntent.FileDecrypted
    );
    expect(backup).not.toHaveProperty('keyParams');
  });

  it('encrypted backup file should have keyParams', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    await application.addPasscode('passcode');
    const backup = await application.createBackupFile(
      EncryptionIntent.FileEncrypted
    );
    expect(backup).toHaveProperty('keyParams');
  });

  it('decrypted backup file should not have itemsKeys', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    const backup = await application.createBackupFile(
      EncryptionIntent.FileDecrypted
    );
    expect(
      backup.items.some((item) => item.content_type === ContentType.ItemsKey)
    ).toBe(false);
  });

  it('encrypted backup file should have itemsKeys', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    await application.addPasscode('passcode');
    const backup = await application.createBackupFile(
      EncryptionIntent.FileEncrypted
    );
    expect(
      backup.items.some((item) => item.content_type === ContentType.ItemsKey)
    ).toBe(true);
  });

  it('backup file with no account and no passcode should be decrypted', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    const note = await Factory.createSyncedNote(application);
    const backup = await application.createBackupFile(
      EncryptionIntent.FileDecrypted
    );
    expect(backup).not.toHaveProperty('keyParams');
    expect(
      backup.items.some((item) => item.content_type === ContentType.ItemsKey)
    ).toBe(false);
    expect(
      backup.items.find((item) => item.content_type === ContentType.Note).uuid
    ).toBe(note.uuid);
    let error;
    try {
      await application.createBackupFile(EncryptionIntent.Encrypted);
    } catch (e) {
      error = e;
    }
    expect(error).toBeTruthy();
  });
});
