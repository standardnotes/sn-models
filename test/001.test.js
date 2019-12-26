import '../node_modules/regenerator-runtime/runtime.js';
import '../dist/snjs.js';
import '../node_modules/chai/chai.js';
import './vendor/chai-as-promised-built.js';
import Factory from './lib/factory.js';

const sn_webprotocolManager = Factory.globalProtocolManager();
const protocol_001 = new SNProtocolOperator001(new SNWebCrypto());

chai.use(chaiAsPromised);
var expect = chai.expect;

describe('001 protocol operations', () => {

  var _identifier = "hello@test.com";
  var _password = "password";
  var _keyParams, _key;

  before((done) => {
    // runs before all tests in this block
    protocol_001.createRootKey({identifier: _identifier, password: _password}).then((result) => {
      _keyParams = result.keyParams;
      _key = result.key;
      done();
    })
  });

  it('cost minimum', () => {
    var currentVersion = sn_webprotocolManager.version();
    expect(sn_webprotocolManager.costMinimumForVersion("001")).to.equal(3000);
  });

  it('generates random key', async () => {
    const length = 128;
    const key = await protocol_001.crypto.generateRandomKey(length);
    expect(key.length).to.equal(length/4);
  });

  it('generates valid keys for registration', async () => {
    const result = await protocol_001.createRootKey({identifier: _identifier, password: _password});
    expect(result).to.have.property("key");
    expect(result).to.have.property("keyParams");

    expect(result.key.serverAuthenticationValue).to.not.be.null;
    expect(result.key.masterKey).to.not.be.null;

    expect(result.keyParams.seed).to.not.be.null;
    expect(result.keyParams.kdfIterations).to.not.be.null;
    expect(result.keyParams.salt).to.not.be.null;
  });

  it('properly encrypts and decrypts', async () => {
    var text = "hello world";
    const key = _key.masterKey;
    var iv = await protocol_001.crypto.generateRandomKey(128);
    let wc_encryptionResult = await protocol_001.encryptText(text, key, iv);
    let wc_decryptionResult = await protocol_001.decryptText({contentCiphertext: wc_encryptionResult, encryptionKey: key, iv: iv})
    expect(wc_decryptionResult).to.equal(text);
  });

  it('generates existing keys for key params', async () => {
    const key = await protocol_001.computeRootKey({password: _password, keyParams: _keyParams});
    expect(key.content).to.have.property("pw");
    expect(key.content).to.have.property("mk");
    expect(key.compare(_key)).to.be.true;
  });

})
