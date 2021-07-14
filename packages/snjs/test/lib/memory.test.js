import * as Factory from './../factory';

/**
 * Simple empty test page to create and deinit empty application
 * Then check browser Memory tool to make sure there are no leaks.
 */
describe('memory', function () {
  beforeEach(async function () {
    this.application = await Factory.createInitAppWithRandNamespace();
  });

  afterEach(function () {
    this.application.deinit();
    this.application = null;
  });

  it('passes', async function () {
    expect(true).toBe(true);
  });
});
