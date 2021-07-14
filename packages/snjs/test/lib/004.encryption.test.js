import {
  Platform,
  Environment,
  DeinitSource,
  KeyParamsOrigination,
  SNProtocolOperator004,
  ProtocolVersion
} from '@Lib/index';
import { createAndInitializeApplication } from './../factory';
import SNCrypto from '../setup/snjs/snCrypto';

describe('004 protocol operations', () => {
  /** The global Standard Notes application. */
  let testSNApp;

  const identifier = 'hello-test@sn.org';
  const password = 'this-is-a-password-1234';
  let rootKey;

  const protocol004 = new SNProtocolOperator004(new SNCrypto());

  beforeEach(async () => {
    testSNApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);
    rootKey = await protocol004.createRootKey(
      identifier,
      password,
      KeyParamsOrigination.Registration
    );
  });

  afterEach(() => {
    testSNApp.deinit(DeinitSource.SignOut);
  });

  it('should properly encrypt and decrypt a piece of text', async () => {
    const simpleText = 'This is a simple text. It should be encrypted and decrypted successfully.';
    const rawKey = rootKey.masterKey;
    const nonce = await testSNApp.protocolService.crypto.generateRandomKey(192);
    const operator = testSNApp.protocolService.operatorForVersion(ProtocolVersion.V004);
    const authenticatedData = { foo: 'bar' };

    const encString = await operator.encryptString004(
      simpleText,
      rawKey,
      nonce,
      authenticatedData
    );
    const decString = await operator.decryptString004(
      encString,
      rawKey,
      nonce,
      await operator.authenticatedDataToString(authenticatedData)
    );

    expect(decString).toEqual(simpleText);
  });
});
