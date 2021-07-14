import { CreateMaxPayloadFromAnyObject } from '@Lib/index';
import { ContentType } from '@Lib/models';
import { EncryptionIntent } from '@Lib/protocol';
import { Uuid } from '@Lib/uuid';
import * as Factory from '../factory';

describe('protocol', function () {
  let application;

  beforeEach(async function () {
    application = await Factory.createInitAppWithRandNamespace();
  });

  afterEach(function () {
    application.deinit();
    application = null;
  });

  it('checks version to make sure its 004', function () {
    expect(application.protocolService.getLatestVersion()).toBe('004');
  });

  it('checks supported versions to make sure it includes 001, 002, 003, 004', function () {
    expect(application.protocolService.supportedVersions()).toEqual([
      '001',
      '002',
      '003',
      '004',
    ]);
  });

  it('platform derivation support', function () {
    expect(
      application.protocolService.platformSupportsKeyDerivation({
        version: '001',
      })
    ).toBe(true);
    expect(
      application.protocolService.platformSupportsKeyDerivation({
        version: '002',
      })
    ).toBe(true);
    expect(
      application.protocolService.platformSupportsKeyDerivation({
        version: '003',
      })
    ).toBe(true);
    expect(
      application.protocolService.platformSupportsKeyDerivation({
        version: '004',
      })
    ).toBe(true);
    expect(
      application.protocolService.platformSupportsKeyDerivation({
        version: '005',
      })
    ).toBe(true);
  });

  it('key params versions <= 002 should include pw_cost in portable value', function () {
    const keyParams002 = application.protocolService.createKeyParams({
      version: '002',
      pw_cost: 5000,
    });
    expect(keyParams002.getPortableValue().pw_cost).toBeTruthy();
  });

  it('version comparison of 002 should be older than library version', function () {
    expect(
      application.protocolService.isVersionNewerThanLibraryVersion('002')
    ).toBe(false);
  });

  it('version comparison of 005 should be newer than library version', function () {
    expect(
      application.protocolService.isVersionNewerThanLibraryVersion('005')
    ).toBe(true);
  });

  it('library version should not be outdated', function () {
    var currentVersion = application.protocolService.getLatestVersion();
    expect(
      application.protocolService.isProtocolVersionOutdated(currentVersion)
    ).toBe(false);
  });

  it('decrypting already decrypted payload should return same payload', async function () {
    const payload = Factory.createNotePayload();
    const result = await application.protocolService.payloadByDecryptingPayload(
      payload
    );
    expect(payload).toBe(result);
    expect(result.errorDecrypting).toBeFalsy();
  });

  it('ejected payload should not have meta fields', async function () {
    await application.addPasscode('123');
    const payload = Factory.createNotePayload();
    const result = await application.protocolService.payloadByEncryptingPayload(
      payload,
      EncryptionIntent.Sync
    );
    const ejected = result.ejected();
    expect(ejected.fields).toBeFalsy();
    expect(ejected.source).toBeFalsy();
    expect(ejected.format).toBeFalsy();
    expect(ejected.dirtiedDate).toBeFalsy();
  });

  it('decrypting 000 payload should succeed', async function () {
    const payload = CreateMaxPayloadFromAnyObject({
      uuid: await Uuid.GenerateUuid(),
      content_type: ContentType.Mfa,
      content: {
        secret: '123',
      },
    });
    const encrypted = await application.protocolService.payloadByEncryptingPayload(
      payload,
      EncryptionIntent.SyncDecrypted
    );
    expect(encrypted.content.startsWith('000')).toBe(true);
    const decrypted = await application.protocolService.payloadByDecryptingPayload(
      encrypted
    );
    expect(decrypted.errorDecrypting).toBeFalsy();
    expect(decrypted.content.secret).toBe(payload.content.secret);
  });

  it('encrypted payload for server should include duplicate_of field', async function () {
    const payload = Factory.createNotePayload('Test');
    const encryptedPayload = await application.protocolService.payloadByEncryptingPayload(
      payload,
      EncryptionIntent.Sync
    );
    expect(encryptedPayload).toBeTruthy();
    expect(encryptedPayload).toHaveProperty('duplicate_of');
  });

  it('ejected payload for server should include duplicate_of field', async function () {
    const payload = Factory.createNotePayload('Test');
    const encryptedPayload = await application.protocolService.payloadByEncryptingPayload(
      payload,
      EncryptionIntent.Sync
    );
    const ejected = encryptedPayload.ejected();
    expect(ejected).toBeTruthy();
    expect(ejected).toHaveProperty('duplicate_of');
  });

  it('encrypted payload for storage should include duplicate_of field', async function () {
    const payload = Factory.createNotePayload('Test');
    const encryptedPayload = await application.protocolService.payloadByEncryptingPayload(
      payload,
      EncryptionIntent.LocalStorageEncrypted
    );
    expect(encryptedPayload).toBeTruthy();
    expect(encryptedPayload).toHaveProperty('duplicate_of');
  });

  it('ejected payload for storage should include duplicate_of field', async function () {
    const payload = Factory.createNotePayload('Test');
    const encryptedPayload = await application.protocolService.payloadByEncryptingPayload(
      payload,
      EncryptionIntent.LocalStorageEncrypted
    );
    const ejected = encryptedPayload.ejected();
    expect(ejected).toBeTruthy();
    expect(ejected).toHaveProperty('duplicate_of');
  });

  it('encrypted payload for file should include duplicate_of field', async function () {
    const payload = Factory.createNotePayload('Test');
    const encryptedPayload = await application.protocolService.payloadByEncryptingPayload(
      payload,
      EncryptionIntent.FileEncrypted
    );
    expect(encryptedPayload).toBeTruthy();
    expect(encryptedPayload).toHaveProperty('duplicate_of');
  });

  it('ejected payload for file should include duplicate_of field', async function () {
    const payload = Factory.createNotePayload('Test');
    const encryptedPayload = await application.protocolService.payloadByEncryptingPayload(
      payload,
      EncryptionIntent.FileEncrypted
    );
    const ejected = encryptedPayload.ejected();
    expect(ejected).toBeTruthy();
    expect(ejected).toHaveProperty('duplicate_of');
  });
});
