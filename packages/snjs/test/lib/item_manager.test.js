import * as Factory from '../factory';
import SNCrypto from '../setup/snjs/snCrypto';
import {
  PayloadManager,
  ItemManager,
  ContentType,
  AppDataField,
  CopyPayload,
  CreateMaxPayloadFromAnyObject,
  PayloadSource,
  SNItem,
  Uuid
} from '@Lib/index';
import sinon from 'sinon';

describe('item manager', function () {
  let payloadManager, itemManager;

  const createNote = async () => {
    return itemManager.createItem(ContentType.Note, {
      title: 'hello',
      text: 'world',
    });
  };

  const createTag = async (notes = []) => {
    const references = notes.map((note) => {
      return {
        uuid: note.uuid,
        content_type: note.content_type,
      };
    });
    return itemManager.createItem(ContentType.Tag, {
      title: 'thoughts',
      references: references,
    });
  };

  beforeAll(async function () {
    const crypto = new SNCrypto();
    Uuid.SetGenerators(crypto.generateUUIDSync, crypto.generateUUID);
  });

  beforeEach(function () {
    payloadManager = new PayloadManager();
    itemManager = new ItemManager(payloadManager);
  });

  it('create item', async function () {
    const item = await createNote();

    expect(item).toBeTruthy();
    expect(item.title).toBe('hello');
  });

  it('emitting item through payload and marking dirty should have userModifiedDate', async function () {
    const payload = Factory.createNotePayload();
    itemManager.emitItemFromPayload(payload, PayloadSource.LocalChanged);
    const result = await itemManager.setItemDirty(payload.uuid);
    const appData = result.payload.content.appData;
    expect(appData[SNItem.DefaultAppDomain()][AppDataField.UserModifiedDate]).toBeTruthy();
  });

  it('find items with valid uuid', async function () {
    const item = await createNote();

    const results = await itemManager.findItems([item.uuid]);
    expect(results.length).toBe(1);
    expect(results[0]).toBe(item);
  });

  it('find items with invalid uuid no blanks', async function () {
    const includeBlanks = false;
    const results = await itemManager.findItems(
      [Factory.generateUuidish()],
      includeBlanks
    );
    expect(results.length).toBe(0);
  });

  it('find items with invalid uuid include blanks', async function () {
    const includeBlanks = true;
    const results = await itemManager.findItems(
      [Factory.generateUuidish()],
      includeBlanks
    );
    expect(results.length).toBe(1);
    expect(results[0]).toBeFalsy();
  });

  it('item state', async function () {
    await createNote();

    expect(itemManager.items.length).toBe(1);
    expect(itemManager.notes.length).toBe(1);
  });

  it('find item', async function () {
    const item = await createNote();

    const foundItem = itemManager.findItem(item.uuid);
    expect(foundItem).toBeTruthy();
  });

  it('reference map', async function () {
    const note = await createNote();
    const tag = await createTag([note]);

    expect(
      itemManager.collection.referenceMap.directMap[tag.uuid]
    ).toEqual([note.uuid]);
  });

  it('inverse reference map', async function () {
    const note = await createNote();
    const tag = await createTag([note]);

    expect(
      itemManager.collection.referenceMap.inverseMap[note.uuid]
    ).toEqual([tag.uuid]);
  });

  it('inverse reference map should not have duplicates', async function () {
    const note = await createNote();
    const tag = await createTag([note]);
    await itemManager.changeItem(tag.uuid);

    expect(
      itemManager.collection.referenceMap.inverseMap[note.uuid]
    ).toEqual([tag.uuid]);
  });

  it('deleting from reference map', async function () {
    const note = await createNote();
    const tag = await createTag([note]);
    await itemManager.setItemToBeDeleted(note.uuid);

    expect(itemManager.collection.referenceMap.directMap[tag.uuid]).toEqual([]);
    expect(itemManager.collection.referenceMap.inverseMap[note.uuid]).toBeFalsy();
  });

  it('deleting referenced item should update referencing item references', async function () {
    const note = await createNote();
    let tag = await createTag([note]);
    await itemManager.setItemToBeDeleted(note.uuid);

    tag = itemManager.findItem(tag.uuid);
    expect(tag.content.references.length).toBe(0);
  });

  it('removing relationship should update reference map', async function () {
    const note = await createNote();
    const tag = await createTag([note]);
    await itemManager.changeItem(tag.uuid, (mutator) => {
      mutator.removeItemAsRelationship(note);
    });

    expect(itemManager.collection.referenceMap.directMap[tag.uuid]).toEqual([]);
    expect(
      itemManager.collection.referenceMap.inverseMap[note.uuid]
    ).toEqual([]);
  });

  it('emitting discardable payload should remove it from our collection', async function () {
    const note = await createNote();
    const payload = note.payloadRepresentation({
      deleted: true,
      dirty: false,
    });
    await itemManager.emitItemFromPayload(payload);

    expect(payload.discardable).toBe(true);
    expect(itemManager.findItem(note.uuid)).toBeFalsy();
  });

  it('items that reference item', async function () {
    const note = await createNote();
    const tag = await createTag([note]);

    const itemsThatReference = itemManager.itemsReferencingItem(note.uuid);
    expect(itemsThatReference.length).toBe(1);
    expect(itemsThatReference[0]).toBe(tag);
  });

  it('observer', async function () {
    const observed = [];
    itemManager.addObserver(
      ContentType.Any,
      (changed, inserted, discarded, ignored, source, sourceKey) => {
        observed.push({ changed, inserted, discarded, source, sourceKey });
      }
    );
    const note = await createNote();
    const tag = await createTag([note]);
    expect(observed.length).toBe(2);

    const firstObserved = observed[0];
    expect(firstObserved.inserted).toEqual([note]);

    const secondObserved = observed[1];
    expect(secondObserved.inserted).toEqual([tag]);
  });

  it('change existing item', async function () {
    const note = await createNote();
    const newTitle = String(Math.random());
    await itemManager.changeItem(note.uuid, (mutator) => {
      mutator.title = newTitle;
    });

    const latestVersion = itemManager.findItem(note.uuid);
    expect(latestVersion.title).toBe(newTitle);
  });

  it('change non-existant item through uuid should fail', async function () {
    const note = await itemManager.createTemplateItem(ContentType.Note, {
      title: 'hello',
      text: 'world',
    });

    const changeFn = async () => {
      const newTitle = String(Math.random());
      return itemManager.changeItem(note.uuid, (mutator) => {
        mutator.title = newTitle;
      });
    };
    await Factory.expectThrowsAsync(
      () => changeFn(),
      'Attempting to change non-existant item'
    );
  });

  it('set items dirty', async function () {
    const note = await createNote();
    await itemManager.setItemDirty(note.uuid);

    const dirtyItems = itemManager.getDirtyItems();
    expect(dirtyItems.length).toBe(1);
    expect(dirtyItems[0].uuid).toBe(note.uuid);
    expect(dirtyItems[0].dirty).toBe(true);
  });

  it('dirty items should not include errored items', async function () {
    const note = await itemManager.setItemDirty(
      (await createNote()).uuid
    );
    const errorred = CreateMaxPayloadFromAnyObject(note.payload, {
      errorDecrypting: true,
    });
    await itemManager.emitItemsFromPayloads(
      [errorred],
      PayloadSource.LocalChanged
    );
    const dirtyItems = itemManager.getDirtyItems();
    expect(dirtyItems.length).toBe(0);
  });

  it('dirty items should include errored items if they are being deleted', async function () {
    const note = await itemManager.setItemDirty(
      (await createNote()).uuid
    );
    const errorred = CreateMaxPayloadFromAnyObject(note.payload, {
      errorDecrypting: true,
      deleted: true
    });
    await itemManager.emitItemsFromPayloads(
      [errorred],
      PayloadSource.LocalChanged
    );
    const dirtyItems = itemManager.getDirtyItems();
    expect(dirtyItems.length).toBe(1);
  });

  describe('duplicateItem', function () {
    const sandbox = sinon.createSandbox();

    let emitPayloads;

    beforeEach(async function () {
      emitPayloads = sandbox.spy(
        itemManager.payloadManager,
        'emitPayloads'
      );
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should duplicate the item and set the duplicate_of property', async function () {
      const note = await createNote();
      await itemManager.duplicateItem(note.uuid);
      sinon.assert.calledTwice(emitPayloads);

      const originalNote = itemManager.notes[0];
      const duplicatedNote = itemManager.notes[1];

      expect(itemManager.items.length).toBe(2);
      expect(itemManager.notes.length).toBe(2);
      expect(originalNote.uuid).not.toBe(duplicatedNote.uuid);
      expect(originalNote.uuid).toBe(duplicatedNote.duplicateOf);
      expect(originalNote.uuid).toBe(duplicatedNote.payload.duplicate_of);
      expect(duplicatedNote.conflictOf).toBeUndefined();
      expect(duplicatedNote.payload.content.conflict_of).toBeUndefined();
    });

    it('should duplicate the item and set the duplicate_of and conflict_of properties', async function () {
      const note = await createNote();
      await itemManager.duplicateItem(note.uuid, true);
      sinon.assert.calledTwice(emitPayloads);

      const originalNote = itemManager.notes[0];
      const duplicatedNote = itemManager.notes[1];

      expect(itemManager.items.length).toBe(2);
      expect(itemManager.notes.length).toBe(2);
      expect(originalNote.uuid).not.toBe(duplicatedNote.uuid);
      expect(originalNote.uuid).toBe(duplicatedNote.duplicateOf);
      expect(originalNote.uuid).toBe(duplicatedNote.payload.duplicate_of);
      expect(originalNote.uuid).toBe(duplicatedNote.conflictOf);
      expect(originalNote.uuid).toBe(duplicatedNote.payload.content.conflict_of);
    });

    it('duplicate item with relationships', async function () {
      const note = await createNote();
      const tag = await createTag([note]);
      const duplicate = await itemManager.duplicateItem(tag.uuid);

      expect(duplicate.content.references).toHaveLength(1);
      expect(itemManager.items).toHaveLength(3);
      expect(itemManager.tags).toHaveLength(2);
    });

    it('adds duplicated item as a relationship to items referencing it', async function () {
      const note = await createNote();
      let tag = await createTag([note]);
      const duplicateNote = await itemManager.duplicateItem(note.uuid);
      expect(tag.content.references).toHaveLength(1);

      tag = itemManager.findItem(tag.uuid);
      const references = tag.content.references.map((ref) => ref.uuid);
      expect(references).toHaveLength(2);
      expect(references).toEqual(expect.arrayContaining([note.uuid, duplicateNote.uuid]));
    });

    it('duplicates item with additional content', async function () {
      const note = await itemManager.createItem(ContentType.Note, {
        title: 'hello',
        text: 'world',
      });
      const duplicateNote = await itemManager.duplicateItem(
        note.uuid,
        false,
        {
          title: 'hello (copy)',
        }
      );

      expect(duplicateNote.title).toBe('hello (copy)');
      expect(duplicateNote.text).toBe('world');
    });
  });

  it('create template item', async function () {
    const item = await itemManager.createTemplateItem(ContentType.Note, {
      title: 'hello',
    });

    expect(item).toBeTruthy();
    /* Template items should never be added to the record */
    expect(itemManager.items.length).toBe(0);
    expect(itemManager.notes.length).toBe(0);
  });

  it('set item deleted', async function () {
    const note = await createNote();
    await itemManager.setItemToBeDeleted(note.uuid);

    /** Items should never be mutated directly */
    expect(note.deleted).toBeFalsy();

    const latestVersion = itemManager.findItem(note.uuid);
    expect(latestVersion.deleted).toBe(true);
    expect(latestVersion.dirty).toBe(true);
    expect(latestVersion.content).toBeFalsy();
    /** Deleted items stick around until they are synced */
    expect(itemManager.items.length).toBe(1);
    /** Deleted items do not show up in particular arrays (.notes, .tags, .components, etc) */
    expect(itemManager.notes.length).toBe(0);
  });

  it('system smart tags', async function () {
    expect(itemManager.systemSmartTags.length).toBe(3);
  });

  it('find tag by title', async function () {
    const tag = await createTag();

    expect(itemManager.findTagByTitle(tag.title)).toBeTruthy();
  });

  it('find tag by title should be case insensitive', async function () {
    const tag = await createTag();

    expect(itemManager.findTagByTitle(tag.title.toUpperCase())).toBeTruthy();    
  })

  it('find or create tag by title', async function () {
    const title = 'foo';

    expect(await itemManager.findOrCreateTagByTitle(title)).toBeTruthy();
  });

  it('note count', async function () {
    await createNote();
    expect(itemManager.noteCount).toBe(1);
  });

  it('trash', async function () {
    const note = await createNote();
    const versionTwo = await itemManager.changeItem(
      note.uuid,
      (mutator) => {
        mutator.trashed = true;
      }
    );

    expect(itemManager.trashSmartTag).toBeTruthy();
    expect(versionTwo.trashed).toBe(true);
    expect(versionTwo.dirty).toBe(true);
    expect(versionTwo.content).toBeTruthy();

    expect(itemManager.items.length).toBe(1);
    expect(itemManager.trashedItems.length).toBe(1);

    await itemManager.emptyTrash();
    const versionThree = itemManager.findItem(note.uuid);
    expect(versionThree.deleted).toBe(true);
    expect(itemManager.trashedItems.length).toBe(0);
  });

  it('remove all items from memory', async function () {
    const observed = [];
    itemManager.addObserver(
      ContentType.Any,
      (changed, inserted, discarded, ignored) => {
        observed.push({ changed, inserted, discarded, ignored });
      }
    );
    await createNote();
    await itemManager.removeAllItemsFromMemory();

    const deletionEvent = observed[1];
    expect(deletionEvent.discarded[0].deleted).toBe(true);
    expect(itemManager.items.length).toBe(0);
  });

  it('remove item locally', async function () {
    const observed = [];
    itemManager.addObserver(
      ContentType.Any,
      (changed, inserted, discarded, ignored) => {
        observed.push({ changed, inserted, discarded, ignored });
      }
    );
    const note = await createNote();
    await itemManager.removeItemLocally(note);

    expect(observed.length).toBe(1);
    expect(itemManager.findItem(note.uuid)).toBeFalsy();
  });

  it('emitting a payload from within observer should queue to end', async function () {
    /**
     * From within an item observer, we want to emit some changes and await them.
     * We expect that the end result is that whatever was most recently emitted,
     * is propagated to listeners after any pending observation events. That is, when you
     * emit items, it should be done serially, so that emitting while you're emitting does
     * not interrupt the current emission, but instead queues it. This is so that changes
     * are not propagated out of order.
     */
    const payload = Factory.createNotePayload();
    const changedTitle = 'changed title';
    let didEmit = false;
    let latestVersion;
    itemManager.addObserver(
      ContentType.Note,
      (changed, inserted, _discarded, _ignored) => {
        const all = changed.concat(inserted);
        if (!didEmit) {
          didEmit = true;
          const changedPayload = CopyPayload(payload, {
            content: {
              ...payload.content,
              title: changedTitle,
            },
          });
          itemManager.emitItemFromPayload(changedPayload);
        }
        latestVersion = all[0];
      }
    );
    await itemManager.emitItemFromPayload(payload);
    expect(latestVersion.title).toBe(changedTitle);
  });

  describe('searchTags', function() {
    it('should return tag with query matching title', async function() {
      const tag = await itemManager.findOrCreateTagByTitle('tag');

      const results = itemManager.searchTags('tag');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe(tag.title);
    });
    it('should return all tags with query partially matching title', async function() {
      const firstTag = await itemManager.findOrCreateTagByTitle('tag one');
      const secondTag = await itemManager.findOrCreateTagByTitle('tag two');

      const results = itemManager.searchTags('tag');
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe(firstTag.title);
      expect(results[1].title).toBe(secondTag.title);
    });
    it('should be case insensitive', async function() {
      const tag = await itemManager.findOrCreateTagByTitle('Tag');

      const results = itemManager.searchTags('tag');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe(tag.title);
    });
    it('should return tag with query matching delimiter separated component', async function() {
      const tag = await itemManager.findOrCreateTagByTitle('parent.child');

      const results = itemManager.searchTags('child');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe(tag.title);
    });
    it('should return tags with matching query including delimiter', async function() {
      const tag = await itemManager.findOrCreateTagByTitle('parent.child');

      const results = itemManager.searchTags('parent.chi');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe(tag.title);
    });
    it('should return tags in natural order', async function() {
      const firstTag = await itemManager.findOrCreateTagByTitle('tag 100');
      const secondTag = await itemManager.findOrCreateTagByTitle('tag 2');
      const thirdTag = await itemManager.findOrCreateTagByTitle('tag b');
      const fourthTag = await itemManager.findOrCreateTagByTitle('tag a');

      const results = itemManager.searchTags('tag');
      expect(results).toHaveLength(4);
      expect(results[0].title).toBe(secondTag.title);
      expect(results[1].title).toBe(firstTag.title);
      expect(results[2].title).toBe(fourthTag.title);
      expect(results[3].title).toBe(thirdTag.title);
    });
    it('should not return tags associated with note', async function () {
      const firstTag = await itemManager.findOrCreateTagByTitle('tag one');
      const secondTag = await itemManager.findOrCreateTagByTitle('tag two');

      const note = await createNote();
      await itemManager.changeItem(firstTag.uuid, (mutator) => {
        mutator.addItemAsRelationship(note);
      });

      const results = itemManager.searchTags('tag', note);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe(secondTag.title);
    })
  });

  describe('getSortedTagsForNote', function () {
    it('should return tags associated with a note in natural order', async function () {
      const tags = [
        await itemManager.findOrCreateTagByTitle('tag 100'),
        await itemManager.findOrCreateTagByTitle('tag 2'),
        await itemManager.findOrCreateTagByTitle('tag b'),
        await itemManager.findOrCreateTagByTitle('tag a'),
      ];

      const note = await createNote();

      tags.map(async tag => {
        await itemManager.changeItem(tag.uuid, (mutator) => {
          mutator.addItemAsRelationship(note);
        });
      });

      const results = itemManager.getSortedTagsForNote(note);
      expect(results).toHaveLength(tags.length);
      expect(results[0].title).toBe(tags[1].title);
      expect(results[1].title).toBe(tags[0].title);
      expect(results[2].title).toBe(tags[3].title);
      expect(results[3].title).toBe(tags[2].title);
    })
  });

  describe('getTagParentChain', function () {
    it('should return parent tags for a tag', async function () {
      const parentTags = [
        await itemManager.findOrCreateTagByTitle('parent'),
        await itemManager.findOrCreateTagByTitle('parent.child'),
      ];
      const grandchildTag = await itemManager.findOrCreateTagByTitle('parent.child.grandchild');
      await itemManager.findOrCreateTagByTitle('some other tag');

      const results = itemManager.getTagParentChain(grandchildTag);
      expect(results).toHaveLength(parentTags.length);
      expect(results).toEqual(expect.arrayContaining([parentTags[0]]));
      expect(results).toEqual(expect.arrayContaining([parentTags[1]]));
    })
  });

  describe('getTagDescendants', function () {
    it('should return descendant tags for a parent tag', async function () {
      const parentTag = await itemManager.findOrCreateTagByTitle('parent');
      const descendantTags = [
        await itemManager.findOrCreateTagByTitle('parent.firstChild'),
        await itemManager.findOrCreateTagByTitle('parent.firstChild.grandchild'),
        await itemManager.findOrCreateTagByTitle('parent.secondChild'),
      ];
      await itemManager.findOrCreateTagByTitle('some other tag');

      const results = itemManager.getTagDescendants(parentTag);
      expect(results).toHaveLength(descendantTags.length);
      expect(results).toEqual(expect.arrayContaining([descendantTags[0]]));
      expect(results).toEqual(expect.arrayContaining([descendantTags[1]]));
      expect(results).toEqual(expect.arrayContaining([descendantTags[2]]));
    })

    it('should return descendant tags for a child tag', async function () {
      const childTag = await itemManager.findOrCreateTagByTitle('parent.child');
      const descendantTags = [
        await itemManager.findOrCreateTagByTitle('parent.child.firstGrandchild'),
        await itemManager.findOrCreateTagByTitle('parent.child.secondGrandchild'),
      ];
      await itemManager.findOrCreateTagByTitle('some other tag');

      const results = itemManager.getTagDescendants(childTag);
      expect(results).toHaveLength(descendantTags.length);
      expect(results).toEqual(expect.arrayContaining([descendantTags[0]]));
      expect(results).toEqual(expect.arrayContaining([descendantTags[1]]));
    })
  })
});
