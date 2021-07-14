import * as Factory from './../factory';
import { SNRootKeyParams } from '@Lib/index';

describe('key params', function () {
  jest.setTimeout(Factory.TestTimeout);

  it('extraneous parameters in key params should be ignored when ejecting', async function () {
    const params = new SNRootKeyParams({
      identifier: 'foo',
      pw_cost: 110000,
      pw_nonce: 'bar',
      pw_salt: 'salt',
      version: '003',
      origination: 'registration',
      created: new Date().getTime(),
      hash: '123',
      foo: 'bar',
    });
    const ejected = params.getPortableValue();
    expect(ejected.hash).toBeFalsy();
    expect(ejected.pw_cost).toBeTruthy();
    expect(ejected.pw_nonce).toBeTruthy();
    expect(ejected.pw_salt).toBeTruthy();
    expect(ejected.version).toBeTruthy();
    expect(ejected.origination).toBeTruthy();
    expect(ejected.created).toBeTruthy();
    expect(ejected.identifier).toBeTruthy();
  });

  describe('with missing version', function () {
    it('should default to 002 if uses high cost', async function () {
      const params = new SNRootKeyParams({
        identifier: 'foo',
        pw_cost: 101000,
        pw_nonce: 'bar',
        pw_salt: 'salt',
      });

      expect(params.version).toBe('002');
    });

    it('should default to 001 if uses low cost', async function () {
      const params = new SNRootKeyParams({
        identifier: 'foo',
        pw_cost: 60000,
        pw_nonce: 'bar',
        pw_salt: 'salt',
      });

      expect(params.version).toBe('002');
    });

    it('should default to 002 if uses cost seen in both 001 and 002, but has no pw_nonce', async function () {
      const params = new SNRootKeyParams({
        identifier: 'foo',
        pw_cost: 60000,
        pw_nonce: undefined,
        pw_salt: 'salt',
      });

      expect(params.version).toBe('002');
    });

    it('should default to 001 if uses cost seen in both 001 and 002, but is more likely a 001 cost', async function () {
      const params = new SNRootKeyParams({
        identifier: 'foo',
        pw_cost: 5000,
        pw_nonce: 'bar',
        pw_salt: 'salt',
      });

      expect(params.version).toBe('001');
    });
  });
});
