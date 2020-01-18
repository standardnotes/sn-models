import '../node_modules/regenerator-runtime/runtime.js';
import '../dist/snjs.js';
import '../node_modules/chai/chai.js';
import './vendor/chai-as-promised-built.js';
import Factory from './lib/factory.js';
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('migrations', () => {

  before(async () => {
    localStorage.clear();
  })

  after(async () => {
    localStorage.clear();
  })

  it('migration timestamp should be a number', async function () {
    const timestamp = BaseMigration.timestamp();
    expect(typeof timestamp).to.equal('number');
  });

  it('last migration timestamp should be a number', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    const timestamp = await application.migrationService
      .getLastMigrationTimestamp();
    expect(typeof timestamp).to.equal('number');
  });

  it('should run base migration', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    const baseMigrationTimestamp = BaseMigration.timestamp();
    const lastMigrationTimestamp = await application.migrationService
      .getLastMigrationTimestamp();
    expect(lastMigrationTimestamp).to.be.above(baseMigrationTimestamp);
  });

  it.only('should run 2020-01-15 migration for web', async function () {
    const application = await Factory.createAppWithRandNamespace();
    /** Create legacy migrations value so that base migration detects old app */
    await application.deviceInterface.setRawStorageValue(
      'migrations',
      JSON.stringify(['anything'])
    );
    const operator_003 = new SNProtocolOperator003(new SNWebCrypto());
    const identifier = 'foo';
    const passcode = 'bar';
    /** Create old version passcode parameters */
    const passcodeResult = await operator_003.createRootKey({
      identifier: identifier,
      password: passcode
    });
    await application.deviceInterface.setRawStorageValue(
      'offlineParams',
      JSON.stringify(passcodeResult.keyParams)
    );
    const passcodeKey = passcodeResult.key;

    /** Create old version account parameters */
    const password = 'tar';
    const accountResult = await operator_003.createRootKey({
      identifier: identifier,
      password: password
    });

    /** Create legacy storage and encrypt it with passcode */
    const accountKey = accountResult.key;
    const embeddedStorage = {
      mk: accountKey.masterKey,
      ak: accountKey.dataAuthenticationKey,
      pw: accountKey.serverPassword,
      auth_params: accountResult.keyParams,
      foo: 'bar'
    };
    const storagePayload = CreateMaxPayloadFromAnyObject({
      object: {
        uuid: await operator_003.crypto.generateUUID(),
        content: {
          storage: embeddedStorage
        },
        content_type: CONTENT_TYPE_ENCRYPTED_STORAGE
      }
    })
    const encryptionParams = await operator_003.generateEncryptionParameters({
      payload: storagePayload,
      key: passcodeResult.key,
      format: PAYLOAD_CONTENT_FORMAT_ENCRYPTED_STRING
    });
    const persistPayload = CreateMaxPayloadFromAnyObject({
      object: storagePayload,
      override: encryptionParams
    })
    await application.deviceInterface.setRawStorageValue(
      'encryptedStorage',
      JSON.stringify(persistPayload)
    );

    /** Create encrypted item and store it in db */
    const notePayload = Factory.createNotePayload();
    const noteEncryptionParams = await operator_003.generateEncryptionParameters({
      payload: notePayload,
      key: accountKey,
      format: PAYLOAD_CONTENT_FORMAT_ENCRYPTED_STRING
    });
    const noteEncryptedPayload = CreateMaxPayloadFromAnyObject({
      object: notePayload,
      override: noteEncryptionParams
    });
    await application.deviceInterface.saveRawDatabasePayload(noteEncryptedPayload);

    /** Run migration */
    await application.prepareForLaunch();
    await application.launch({
      ut_awaitDatabaseLoad: true,
      callbacks: {
        authChallengeResponses: (challenges) => {
          const responses = [];
          for(const challenge of challenges) {
            if(challenge === CHALLENGE_LOCAL_PASSCODE) {
              responses.push(new DeviceAuthResponse({
                challenge,
                value: passcode
              }));
            }
          }
          return responses;
        }
      }
    });

    expect(application.keyManager.keyMode).to.equal(
      KEY_MODE_ROOT_KEY_PLUS_WRAPPER
    );

    /** Should be decrypted */
    const storageMode = application.storageManager.domainKeyForMode(
      STORAGE_VALUE_MODE_DEFAULT
    );
    const valueStore = application.storageManager.values[storageMode];
    expect(valueStore.content_type).to.not.be.ok;

    /** Embedded value should match */
    const migratedKeyParams = await application.storageManager.getValue(
      STORAGE_KEY_ROOT_KEY_PARAMS
    );
    expect(migratedKeyParams).to.eql(embeddedStorage.auth_params);
    const rootKey = await application.keyManager.getRootKey()
    expect(rootKey.masterKey).to.equal(accountKey.masterKey);
    expect(rootKey.dataAuthenticationKey).to.equal(accountKey.dataAuthenticationKey);
    expect(rootKey.serverPassword).to.equal(accountKey.serverPassword);
    expect(rootKey.version).to.equal(SNProtocolOperator003.versionString());
    expect(application.keyManager.keyMode).to.equal(KEY_MODE_ROOT_KEY_PLUS_WRAPPER);

    /** Expect note is decrypted */
    expect(application.modelManager.notes.length).to.equal(1);
    const retrievedNote = application.modelManager.notes[0];
    expect(retrievedNote.uuid).to.equal(notePayload.uuid);
    expect(retrievedNote.content.text).to.equal(notePayload.content.text);
  });

});
