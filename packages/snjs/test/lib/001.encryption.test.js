import * as Factory from './../factory';
import { SNProtocolOperator001, KeyParamsOrigination, PayloadFormat, CreateMaxPayloadFromAnyObject } from '@Lib/index';
import SNCrypto from '../setup/snjs/snCrypto';

describe('001 protocol operations', () => {
  let application;
  const protocol001 = new SNProtocolOperator001(new SNCrypto());

  const _identifier = 'hello@test.com';
  const _password = 'password';
  let _keyParams, _key;

  // runs once before all tests in this block
  beforeAll(async () => {
    application = await Factory.createAndInitializeApplication();
    _key = await protocol001.createRootKey(
      _identifier,
      _password,
      KeyParamsOrigination.Registration
    );
    _keyParams = _key.keyParams;
  });

  it('generates random key', async () => {
    const length = 128;
    const key = await protocol001.crypto.generateRandomKey(length);
    expect(key.length).toEqual(length / 4);
  });

  it('cost minimum', () => {
    expect(application.protocolService.costMinimumForVersion('001')).toEqual(
      3000
    );
  });

  it('generates valid keys for registration', async () => {
    const key = await protocol001.createRootKey(
      _identifier,
      _password,
      KeyParamsOrigination.Registration
    );
    expect(key.serverPassword).toBeDefined;
    expect(key.masterKey).toBeDefined;

    expect(key.keyParams.content.pw_nonce).toBeDefined;
    expect(key.keyParams.content.pw_cost).toBeDefined;
    expect(key.keyParams.content.pw_salt).toBeDefined;
  });

  it('generates valid keys from existing params and decrypts', async () => {
    const password = 'password';
    const keyParams = await application.protocolService.createKeyParams({
      pw_func: 'pbkdf2',
      pw_alg: 'sha512',
      pw_key_size: 512,
      pw_cost: 5000,
      pw_salt: '45cf889386d7ed72a0dcfb9d06fee9f6274ec0ce',
    });
    const key = await protocol001.computeRootKey(password, keyParams);
    expect(key.keyVersion).toEqual('001');
    expect(key.serverPassword).toEqual(
      '8f2f0513e90648c08ef6fa55eda00bb76e82dfdc2e218e4338b6246e0f68eb78'
    );
    expect(key.masterKey).toEqual(
      '65e040f8ef6775fecbb7ee5599ec3f059faa96d728e50f2014237a802ac5bd0f'
    );
    expect(key.dataAuthenticationKey).toBeUndefined;
    const payload = CreateMaxPayloadFromAnyObject({
      auth_hash:
        '0ae7e3c9fce61f07a8d5d267accab20793a06ab266c245fe59178d49c1ad3fa6',
      content:
        '001hEIgw837WzFM7Eb5tBHHXumxxKwaWuDv5hyhmrNDTUU5qxnb5jkjo1HsRzw+Z65BMuDqIdHlZU3plW+4QpJ6iFksFPYgo8VHa++dOtfAP7Q=',
      content_type: 'Note',
      enc_item_key:
        'sVuHmG0XAp1PRDE8r8XqFXijjP8Pqdwal9YFRrXK4hKLt1yyq8MwQU+1Z95Tz/b7ajYdidwFE0iDwd8Iu8281VtJsQ4yhh2tJiAzBy6newyHfhA5nH93yZ3iXRJaG87bgNQE9lsXzTV/OHAvqMuQtw/QVSWI3Qy1Pyu1Tn72q7FPKKhRRkzEEZ+Ax0BA1fHg',
      uuid: '54001a6f-7c22-4b34-8316-fadf9b1fc255',
    });
    const decrypted = await application.protocolService.payloadByDecryptingPayload(
      payload,
      key
    );
    expect(decrypted.errorDecrypting).toBeUndefined;
    expect(decrypted.content.text).toEqual('Decryptable Sentence');
  });

  it('properly encrypts and decrypts', async () => {
    const text = 'hello world';
    const key = _key.masterKey;
    const encString = await protocol001.encryptString(text, key);
    const decString = await protocol001.decryptString(encString, key);
    expect(decString).toEqual(text);
  });

  it('generates existing keys for key params', async () => {
    const key = await protocol001.computeRootKey(_password, _keyParams);
    expect(key.content).toHaveProperty('serverPassword');
    expect(key.content).toHaveProperty('masterKey');
    expect(key.compare(_key)).toEqual(true);
  });

  it('generating encryption params includes items_key_id', async () => {
    const payload = Factory.createNotePayload();
    const key = await protocol001.createItemsKey();
    const params = await protocol001.generateEncryptedParameters(
      payload,
      PayloadFormat.EncryptedString,
      key
    );
    expect(params.content).toBeDefined;
    expect(params.enc_item_key).toBeDefined;
    expect(params.auth_hash).toBeDefined;
    expect(params.items_key_id).toEqual(key.uuid);
  });

  it('can decrypt encrypted params', async () => {
    const payload = Factory.createNotePayload();
    const key = await protocol001.createItemsKey();
    const params = await protocol001.generateEncryptedParameters(
      payload,
      PayloadFormat.EncryptedString,
      key
    );

    const decrypted = await protocol001.generateDecryptedParameters(
      params,
      key
    );
    expect(decrypted.content).toEqual(payload.content);
  });

  it('payloads missing enc_item_key should decrypt as errorDecrypting', async () => {
    const payload = Factory.createNotePayload();
    const key = await protocol001.createItemsKey();
    const params = await protocol001.generateEncryptedParameters(
      payload,
      PayloadFormat.EncryptedString,
      key
    );
    const modified = CreateMaxPayloadFromAnyObject(params, {
      enc_item_key: undefined,
    });
    const decrypted = await protocol001.generateDecryptedParameters(
      modified,
      key
    );
    expect(decrypted.errorDecrypting).toEqual(true);
  });
});
