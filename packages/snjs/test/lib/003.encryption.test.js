import {
  Platform,
  Environment,
  DeinitSource,
  KeyParamsOrigination,
  SNProtocolOperator003
} from '@Lib/index';
import { createAndInitializeApplication } from './../factory';
import SNCrypto from '../setup/snjs/snCrypto';

describe('003 protocol operations', () => {
  /** The global Standard Notes application. */
  let testSNApp;

  const identifier = 'hello-test@sn.org';
  const password = 'this-is-a-password-1234';
  let rootKey;

  const protocol003 = new SNProtocolOperator003(new SNCrypto());

  beforeEach(async () => {
    testSNApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);
    rootKey = await protocol003.createRootKey(
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
    const nonce = await protocol003.crypto.generateRandomKey(128);

    const encString = await protocol003.encryptString002(
      simpleText,
      rawKey,
      nonce
    );
    const decString = await protocol003.decryptString002(
      encString,
      rawKey,
      nonce
    );

    expect(decString).toEqual(simpleText);
  });
});
