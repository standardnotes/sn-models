import { CreateMaxPayloadFromAnyObject, PayloadSource, CopyPayload, ComponentArea } from '@Lib/index';
import { SNItem, CreateItemFromPayload, ContentType } from '@Lib/models';
import { EncryptionIntent } from '@Lib/protocol';
import * as Factory from '../../factory';

describe('app models', () => {
  const BASE_ITEM_COUNT = 2; /** Default items key, user preferences */
  const sharedApplication = Factory.createApplication();

  beforeAll(async function () {
    await Factory.initializeApplication(sharedApplication);
  });

  afterAll(async function () {
    sharedApplication.deinit();
  });

  let expectedItemCount;
  let application;

  beforeEach(async function () {
    expectedItemCount = BASE_ITEM_COUNT;
    application = await Factory.createInitAppWithRandNamespace();
  });

  afterEach(async function () {
    await application.deinit();
  });

  it('payloadManager should be defined', () => {
    expect(sharedApplication.payloadManager).toBeTruthy();
  });

  it('item should be defined', () => {
    expect(SNItem).toBeTruthy();
  });

  it('item content should be assigned', () => {
    const params = Factory.createNotePayload();
    const item = CreateItemFromPayload(params);
    expect(item.content.title).toBe(params.content.title);
  });

  it('should default updated_at to 1970 and created_at to the present', () => {
    const params = Factory.createNotePayload();
    const item = CreateItemFromPayload(params);
    const epoch = new Date(0);
    expect(item.serverUpdatedAt - epoch).toBe(0);
    expect(item.created_at - epoch).toBeGreaterThan(0);
    expect(new Date() - item.created_at).toBeLessThan(5); // < 5ms
  });

  it('handles delayed mapping', async function () {
    const params1 = Factory.createNotePayload();
    const params2 = Factory.createNotePayload();

    const mutated = CreateMaxPayloadFromAnyObject(params1, {
      content: {
        ...params1.safeContent,
        references: [
          {
            uuid: params2.uuid,
            content_type: params2.content_type,
          },
        ],
      },
    });

    await application.itemManager.emitItemsFromPayloads(
      [mutated],
      PayloadSource.LocalChanged
    );
    await application.itemManager.emitItemsFromPayloads(
      [params2],
      PayloadSource.LocalChanged
    );

    const item1 = application.itemManager.findItem(params1.uuid);
    const item2 = application.itemManager.findItem(params2.uuid);

    expect(item1.content.references.length).toBe(1);
    expect(item2.content.references.length).toBe(0);

    expect(
      application.itemManager.itemsReferencingItem(item1.uuid).length
    ).toBe(0);
    expect(
      application.itemManager.itemsReferencingItem(item2.uuid).length
    ).toBe(1);
  });

  it('mapping an item twice shouldnt cause problems', async function () {
    const payload = Factory.createNotePayload();
    const mutated = CreateMaxPayloadFromAnyObject(payload, {
      content: {
        ...payload.safeContent,
        foo: 'bar',
      },
    });

    let items = await application.itemManager.emitItemsFromPayloads(
      [mutated],
      PayloadSource.LocalChanged
    );
    let item = items[0];
    expect(item).toBeTruthy();

    items = await application.itemManager.emitItemsFromPayloads(
      [mutated],
      PayloadSource.LocalChanged
    );
    item = items[0];

    expect(item.content.foo).toBe('bar');
    expect(application.itemManager.notes.length).toBe(1);
  });

  it('mapping item twice should preserve references', async function () {
    const item1 = await Factory.createMappedNote(application);
    const item2 = await Factory.createMappedNote(application);

    await application.itemManager.changeItem(item1.uuid, (mutator) => {
      mutator.addItemAsRelationship(item2);
    });
    await application.itemManager.changeItem(item2.uuid, (mutator) => {
      mutator.addItemAsRelationship(item1);
    });

    const refreshedItem = application.itemManager.findItem(item1.uuid);
    expect(refreshedItem.content.references.length).toBe(1);
  });

  it('fixes relationship integrity', async function () {
    var item1 = await Factory.createMappedNote(application);
    var item2 = await Factory.createMappedNote(application);

    await application.itemManager.changeItem(item1.uuid, (mutator) => {
      mutator.addItemAsRelationship(item2);
    });
    await application.itemManager.changeItem(item2.uuid, (mutator) => {
      mutator.addItemAsRelationship(item1);
    });

    const refreshedItem1 = application.itemManager.findItem(item1.uuid);
    const refreshedItem2 = application.itemManager.findItem(item2.uuid);

    expect(refreshedItem1.content.references.length).toBe(1);
    expect(refreshedItem2.content.references.length).toBe(1);

    const damagedPayload = CopyPayload(refreshedItem1.payload, {
      content: {
        ...refreshedItem1.safeContent,
        // damage references of one object
        references: [],
      },
    });
    await application.itemManager.emitItemsFromPayloads(
      [damagedPayload],
      PayloadSource.LocalChanged
    );

    const refreshedItem1_2 = application.itemManager.findItem(item1.uuid);
    const refreshedItem2_2 = application.itemManager.findItem(item2.uuid);

    expect(refreshedItem1_2.content.references.length).toBe(0);
    expect(refreshedItem2_2.content.references.length).toBe(1);
  });

  it('creating and removing relationships between two items should have valid references', async function () {
    var item1 = await Factory.createMappedNote(application);
    var item2 = await Factory.createMappedNote(application);
    await application.itemManager.changeItem(item1.uuid, (mutator) => {
      mutator.addItemAsRelationship(item2);
    });
    await application.itemManager.changeItem(item2.uuid, (mutator) => {
      mutator.addItemAsRelationship(item1);
    });

    const refreshedItem1 = application.itemManager.findItem(item1.uuid);
    const refreshedItem2 = application.itemManager.findItem(item2.uuid);

    expect(refreshedItem1.content.references.length).toBe(1);
    expect(refreshedItem2.content.references.length).toBe(1);

    expect(application.itemManager.itemsReferencingItem(item1.uuid)).toEqual(expect.arrayContaining([refreshedItem2]));
    expect(application.itemManager.itemsReferencingItem(item2.uuid)).toEqual(expect.arrayContaining([refreshedItem1]));

    await application.itemManager.changeItem(item1.uuid, (mutator) => {
      mutator.removeItemAsRelationship(item2);
    });
    await application.itemManager.changeItem(item2.uuid, (mutator) => {
      mutator.removeItemAsRelationship(item1);
    });

    const refreshedItem1_2 = application.itemManager.findItem(item1.uuid);
    const refreshedItem2_2 = application.itemManager.findItem(item2.uuid);

    expect(refreshedItem1_2.content.references.length).toBe(0);
    expect(refreshedItem2_2.content.references.length).toBe(0);

    expect(
      application.itemManager.itemsReferencingItem(item1.uuid).length
    ).toBe(0);
    expect(
      application.itemManager.itemsReferencingItem(item2.uuid).length
    ).toBe(0);
  });

  it('properly duplicates item with no relationships', async function () {
    const item = await Factory.createMappedNote(application);
    const duplicate = await application.itemManager.duplicateItem(
      item.uuid
    );
    expect(duplicate.uuid).not.toBe(item.uuid);
    expect(item.isItemContentEqualWith(duplicate)).toBe(true);
    expect(item.created_at.toISOString()).toBe(duplicate.created_at.toISOString());
    expect(item.content_type).toBe(duplicate.content_type);
  });

  it('properly duplicates item with relationships', async function () {
    const item1 = await Factory.createMappedNote(application);
    const item2 = await Factory.createMappedNote(application);

    const refreshedItem1 = await application.itemManager.changeItem(
      item1.uuid,
      (mutator) => {
        mutator.addItemAsRelationship(item2);
      }
    );

    expect(refreshedItem1.content.references.length).toBe(1);

    const duplicate = await application.itemManager.duplicateItem(
      item1.uuid
    );
    expect(duplicate.uuid).not.toBe(item1.uuid);
    expect(duplicate.content.references.length).toBe(1);

    expect(
      application.itemManager.itemsReferencingItem(item1.uuid).length
    ).toBe(0);
    expect(
      application.itemManager.itemsReferencingItem(item2.uuid).length
    ).toBe(2);

    const refreshedItem1_2 = application.itemManager.findItem(item1.uuid);
    expect(refreshedItem1_2.isItemContentEqualWith(duplicate)).toBe(true);
    expect(refreshedItem1_2.created_at.toISOString()).toBe(duplicate.created_at.toISOString());
    expect(refreshedItem1_2.content_type).toBe(duplicate.content_type);
  });

  it('removing references should update cross-refs', async function () {
    const item1 = await Factory.createMappedNote(application);
    const item2 = await Factory.createMappedNote(application);
    const refreshedItem1 = await application.itemManager.changeItem(
      item1.uuid,
      (mutator) => {
        mutator.addItemAsRelationship(item2);
      }
    );

    const refreshedItem1_2 = await application.itemManager.emitItemFromPayload(
      refreshedItem1.payloadRepresentation({
        deleted: true,
        content: {
          ...refreshedItem1.payload.safeContent,
          references: [],
        },
      }),
      PayloadSource.LocalSaved
    );

    expect(
      application.itemManager.itemsReferencingItem(item2.uuid).length
    ).toBe(0);
    expect(
      application.itemManager.itemsReferencingItem(item1.uuid).length
    ).toBe(0);
    expect(refreshedItem1_2.content.references.length).toBe(0);
  });

  it('properly handles single item uuid alternation', async function () {
    const item1 = await Factory.createMappedNote(application);
    const item2 = await Factory.createMappedNote(application);

    const refreshedItem1 = await application.itemManager.changeItem(
      item1.uuid,
      (mutator) => {
        mutator.addItemAsRelationship(item2);
      }
    );

    expect(refreshedItem1.content.references.length).toBe(1);
    expect(
      application.itemManager.itemsReferencingItem(item2.uuid).length
    ).toBe(1);

    const alternatedItem = await application.syncService.alternateUuidForItem(
      item1.uuid
    );
    const refreshedItem1_2 = application.itemManager.findItem(item1.uuid);
    expect(refreshedItem1_2).toBeFalsy();

    expect(application.itemManager.notes.length).toBe(2);

    expect(alternatedItem.content.references.length).toBe(1);
    expect(
      application.itemManager.itemsReferencingItem(alternatedItem.uuid)
        .length
    ).toBe(0);

    expect(
      application.itemManager.itemsReferencingItem(item2.uuid).length
    ).toBe(1);

    expect(alternatedItem.hasRelationshipWithItem(item2)).toBe(true);
    expect(alternatedItem.dirty).toBe(true);
  });

  it('alterating uuid of item should fill its duplicateOf value', async function () {
    const item1 = await Factory.createMappedNote(application);
    const alternatedItem = await application.syncService.alternateUuidForItem(
      item1.uuid
    );
    expect(alternatedItem.duplicateOf).toBe(item1.uuid);
  });

  it('alterating itemskey uuid should update errored items encrypted with that key', async function () {
    const item1 = await Factory.createMappedNote(application);
    const itemsKey = application.itemManager.itemsKeys()[0];
    /** Encrypt item1 and emit as errored so it persists with items_key_id */
    const encrypted = await application.protocolService.payloadByEncryptingPayload(
      item1.payload,
      EncryptionIntent.Sync
    );
    const errored = CopyPayload(encrypted, {
      errorDecrypting: true,
      waitingForKey: true,
    });
    await application.itemManager.emitItemFromPayload(errored);
    expect(application.findItem(item1.uuid).errorDecrypting).toBe(true);
    expect(application.findItem(item1.uuid).payload.items_key_id).toBe(itemsKey.uuid);
    const alternatedKey = await application.syncService.alternateUuidForItem(
      itemsKey.uuid
    );
    expect(application.findItem(item1.uuid).payload.items_key_id).toBe(alternatedKey.uuid); // <--- This is failing somehow...
  });

  it('properly handles mutli item uuid alternation', async function () {
    const item1 = await Factory.createMappedNote(application);
    const item2 = await Factory.createMappedNote(application);
    expectedItemCount += 2;

    await application.itemManager.changeItem(item1.uuid, (mutator) => {
      mutator.addItemAsRelationship(item2);
    });

    expect(
      application.itemManager.itemsReferencingItem(item2.uuid).length
    ).toBe(1);

    const alternatedItem1 = await application.syncService.alternateUuidForItem(
      item1.uuid
    );
    const alternatedItem2 = await application.syncService.alternateUuidForItem(
      item2.uuid
    );

    expect(application.itemManager.items.length).toBe(expectedItemCount);

    expect(item1.uuid).not.toBe(alternatedItem1.uuid);
    expect(item2.uuid).not.toBe(alternatedItem2.uuid);

    const refreshedAltItem1 = application.itemManager.findItem(
      alternatedItem1.uuid
    );
    expect(refreshedAltItem1.content.references.length).toBe(1);
    expect(refreshedAltItem1.content.references[0].uuid).toBe(alternatedItem2.uuid);
    expect(alternatedItem2.content.references.length).toBe(0);

    expect(
      application.itemManager.itemsReferencingItem(alternatedItem2.uuid)
        .length
    ).toBe(1);

    expect(refreshedAltItem1.hasRelationshipWithItem(alternatedItem2)).toBe(true);
    expect(alternatedItem2.hasRelationshipWithItem(refreshedAltItem1)).toBe(false);
    expect(refreshedAltItem1.dirty).toBe(true);
  });

  it('maintains referencing relationships when duplicating', async function () {
    const tag = await Factory.createMappedTag(application);
    const note = await Factory.createMappedNote(application);
    const refreshedTag = await application.itemManager.changeItem(
      tag.uuid,
      (mutator) => {
        mutator.addItemAsRelationship(note);
      }
    );

    expect(refreshedTag.content.references.length).toBe(1);

    const noteCopy = await application.itemManager.duplicateItem(
      note.uuid
    );
    expect(note.uuid).not.toBe(noteCopy.uuid);

    expect(application.itemManager.notes.length).toBe(2);
    expect(application.itemManager.tags.length).toBe(1);

    expect(note.content.references.length).toBe(0);
    expect(noteCopy.content.references.length).toBe(0);
    const refreshedTag_2 = application.itemManager.findItem(tag.uuid);
    expect(refreshedTag_2.content.references.length).toBe(2);
  });

  it('maintains editor reference when duplicating note', async function () {
    const note = await Factory.createMappedNote(application);
    const editor = await application.createManagedItem(
      ContentType.Component,
      { area: ComponentArea.Editor },
      true
    );
    await application.itemManager.changeComponent(
      editor.uuid,
      (mutator) => {
        mutator.associateWithItem(note.uuid);
      }
    );

    expect(application.componentManager.editorForNote(note).uuid).toBe(editor.uuid);

    const duplicate = await application.itemManager.duplicateItem(
      note.uuid,
      true
    );
    expect(
      application.componentManager.editorForNote(duplicate).uuid
    ).toBe(editor.uuid);
  });
});
