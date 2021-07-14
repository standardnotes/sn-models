import { PayloadSource } from '@Lib/index';
import * as Factory from './../../factory';

describe('items', () => {
  const BASE_ITEM_COUNT = 2; /** Default items key, user preferences */

  const syncOptions = {
    checkIntegrity: true,
    awaitAll: true,
  };

  let expectedItemCount;
  let application;

  beforeEach(async function () {
    expectedItemCount = BASE_ITEM_COUNT;
    application = await Factory.createInitAppWithRandNamespace();
  });

  afterEach(async function () {
    await application.deinit();
  });

  it('setting an item as dirty should update its client updated at', async function () {
    const params = Factory.createNotePayload();
    await application.itemManager.emitItemsFromPayloads(
      [params],
      PayloadSource.LocalChanged
    );
    const item = application.itemManager.items[0];
    const prevDate = item.userModifiedDate.getTime();
    await Factory.sleep(0.1);
    await application.itemManager.setItemDirty(item.uuid, true);
    const refreshedItem = application.itemManager.findItem(item.uuid);
    const newDate = refreshedItem.userModifiedDate.getTime();
    expect(prevDate).not.toBe(newDate);
  });

  it('setting an item as dirty with option to skip client updated at', async function () {
    const params = Factory.createNotePayload();
    await application.itemManager.emitItemsFromPayloads(
      [params],
      PayloadSource.LocalChanged
    );
    const item = application.itemManager.items[0];
    const prevDate = item.userModifiedDate.getTime();
    await Factory.sleep(0.1);
    await application.itemManager.setItemDirty(item.uuid);
    const newDate = item.userModifiedDate.getTime();
    expect(prevDate).toBe(newDate);
  });

  it('properly pins, archives, and locks', async function () {
    const params = Factory.createNotePayload();
    await application.itemManager.emitItemsFromPayloads(
      [params],
      PayloadSource.LocalChanged
    );

    const item = application.itemManager.items[0];
    expect(item.pinned).toBeFalsy();

    const refreshedItem = await application.changeAndSaveItem(
      item.uuid,
      (mutator) => {
        mutator.pinned = true;
        mutator.archived = true;
        mutator.locked = true;
      },
      undefined,
      undefined,
      syncOptions
    );
    expect(refreshedItem.pinned).toBe(true);
    expect(refreshedItem.archived).toBe(true);
    expect(refreshedItem.locked).toBe(true);
  });

  it('properly compares item equality', async function () {
    const params1 = Factory.createNotePayload();
    const params2 = Factory.createNotePayload();
    await application.itemManager.emitItemsFromPayloads(
      [params1, params2],
      PayloadSource.LocalChanged
    );

    let item1 = application.itemManager.notes[0];
    let item2 = application.itemManager.notes[1];

    expect(item1.isItemContentEqualWith(item2)).toBe(true);

    // items should ignore this field when checking for equality
    item1 = await application.changeAndSaveItem(
      item1.uuid,
      (mutator) => {
        mutator.userModifiedDate = new Date();
      },
      undefined,
      undefined,
      syncOptions
    );
    item2 = await application.changeAndSaveItem(
      item2.uuid,
      (mutator) => {
        mutator.userModifiedDate = undefined;
      },
      undefined,
      undefined,
      syncOptions
    );

    expect(item1.isItemContentEqualWith(item2)).toBe(true);

    item1 = await application.changeAndSaveItem(
      item1.uuid,
      (mutator) => {
        mutator.content.foo = 'bar';
      },
      undefined,
      undefined,
      syncOptions
    );

    expect(item1.isItemContentEqualWith(item2)).toBe(false);

    item2 = await application.changeAndSaveItem(
      item2.uuid,
      (mutator) => {
        mutator.content.foo = 'bar';
      },
      undefined,
      undefined,
      syncOptions
    );

    expect(item1.isItemContentEqualWith(item2)).toBe(true);
    expect(item2.isItemContentEqualWith(item1)).toBe(true);

    item1 = await application.changeAndSaveItem(
      item1.uuid,
      (mutator) => {
        mutator.addItemAsRelationship(item2);
      },
      undefined,
      undefined,
      syncOptions
    );
    item2 = await application.changeAndSaveItem(
      item2.uuid,
      (mutator) => {
        mutator.addItemAsRelationship(item1);
      },
      undefined,
      undefined,
      syncOptions
    );

    expect(item1.content.references.length).toBe(1);
    expect(item2.content.references.length).toBe(1);

    expect(item1.isItemContentEqualWith(item2)).toBe(false);

    item1 = await application.changeAndSaveItem(
      item1.uuid,
      (mutator) => {
        mutator.removeItemAsRelationship(item2);
      },
      undefined,
      undefined,
      syncOptions
    );
    item2 = await application.changeAndSaveItem(
      item2.uuid,
      (mutator) => {
        mutator.removeItemAsRelationship(item1);
      },
      undefined,
      undefined,
      syncOptions
    );

    expect(item1.isItemContentEqualWith(item2)).toBe(true);
    expect(item1.content.references.length).toBe(0);
    expect(item2.content.references.length).toBe(0);
  });

  it('content equality should not have side effects', async function () {
    const params1 = Factory.createNotePayload();
    const params2 = Factory.createNotePayload();
    await application.itemManager.emitItemsFromPayloads(
      [params1, params2],
      PayloadSource.LocalChanged
    );

    let item1 = application.itemManager.notes[0];
    const item2 = application.itemManager.notes[1];

    item1 = await application.changeAndSaveItem(
      item1.uuid,
      (mutator) => {
        mutator.content.foo = 'bar';
      },
      undefined,
      undefined,
      syncOptions
    );

    expect(item1.content.foo).toBe('bar');

    item1.contentKeysToIgnoreWhenCheckingEquality = () => {
      return ['foo'];
    };

    item2.contentKeysToIgnoreWhenCheckingEquality = () => {
      return ['foo'];
    };

    // calling isItemContentEqualWith should not have side effects
    // There was an issue where calling that function would modify values directly to omit keys
    // in contentKeysToIgnoreWhenCheckingEquality.

    await application.itemManager.setItemsDirty([item1.uuid, item2.uuid]);

    expect(item1.userModifiedDate).toBeTruthy();
    expect(item2.userModifiedDate).toBeTruthy();

    expect(item1.isItemContentEqualWith(item2)).toBe(true);
    expect(item2.isItemContentEqualWith(item1)).toBe(true);

    expect(item1.userModifiedDate).toBeTruthy();
    expect(item2.userModifiedDate).toBeTruthy();

    expect(item1.content.foo).toBe('bar');
  });
});
