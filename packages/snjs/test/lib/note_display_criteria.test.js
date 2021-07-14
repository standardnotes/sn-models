import { ItemCollection, CollectionSort, NotesDisplayCriteria, notesMatchingCriteria } from '@Lib/index';
import { ContentType, CreateItemFromPayload } from '@Lib/models';
import { PayloadManager, ItemManager } from '@Lib/services';
import { Uuid } from '@Lib/uuid';
import SNCrypto from '../setup/snjs/snCrypto';
import * as Factory from '../factory';

describe('note display criteria', function () {
  let payloadManager, itemManager;

  const createNote = async (title = 'hello', text = 'world') => {
    return itemManager.createItem(ContentType.Note, {
      title: title,
      text: text,
    });
  };

  const createTag = async (notes = [], title = 'thoughts') => {
    const references = notes.map((note) => {
      return {
        uuid: note.uuid,
        content_type: note.content_type,
      };
    });
    return itemManager.createItem(ContentType.Tag, {
      title: title,
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

  const emptyCollection = function () {
    const collection = new ItemCollection();
    collection.setDisplayOptions(
      ContentType.Note,
      CollectionSort.CreatedAt,
      'asc'
    );
    return collection;
  };

  const collectionWithNotes = function (titles = [], bodies = []) {
    const collection = emptyCollection();
    const notes = [];
    titles.forEach((title, index) => {
      notes.push(
        CreateItemFromPayload(Factory.createNotePayload(title, bodies[index]))
      );
    });
    collection.set(notes);
    return collection;
  };

  it('display criteria copying', async function () {
    const criteria = NotesDisplayCriteria.Create({ includeArchived: true });
    const copy = NotesDisplayCriteria.Copy(criteria, { includeTrashed: true });
    expect(copy.includeArchived).toBe(true);
    expect(copy.includeTrashed).toBe(true);
  });

  it('string query title', async function () {
    const query = 'foo';
    const criteria = NotesDisplayCriteria.Create({
      searchQuery: { query: query },
    });
    const collection = collectionWithNotes(['hello', 'fobar', 'foobar', 'foo']);
    expect(notesMatchingCriteria(criteria, collection).length).toBe(2);
  });

  it('string query text', async function () {
    const query = 'foo';
    const criteria = NotesDisplayCriteria.Create({
      searchQuery: { query: query },
    });
    const collection = collectionWithNotes(
      [undefined, undefined, undefined, undefined],
      ['hello', 'fobar', 'foobar', 'foo']
    );
    expect(notesMatchingCriteria(criteria, collection).length).toBe(2);
  });

  it('string query title and text', async function () {
    const query = 'foo';
    const criteria = NotesDisplayCriteria.Create({
      searchQuery: { query: query },
    });
    const collection = collectionWithNotes(
      ['hello', 'foobar'],
      ['foo', 'fobar']
    );
    expect(notesMatchingCriteria(criteria, collection).length).toBe(2);
  });

  it('includePinned off', async function () {
    await createNote();
    const pendingPin = await createNote();
    await itemManager.changeItem(pendingPin.uuid, (mutator) => {
      mutator.pinned = true;
    });
    const criteria = NotesDisplayCriteria.Create({ includePinned: false });
    expect(
      notesMatchingCriteria(criteria, itemManager.collection).length
    ).toBe(1);
  });

  it('includePinned on', async function () {
    await createNote();
    const pendingPin = await createNote();
    await itemManager.changeItem(pendingPin.uuid, (mutator) => {
      mutator.pinned = true;
    });
    const criteria = NotesDisplayCriteria.Create({ includePinned: true });
    expect(
      notesMatchingCriteria(criteria, itemManager.collection).length
    ).toBe(2);
  });

  it('includeTrashed off', async function () {
    await createNote();
    const pendingTrash = await createNote();
    await itemManager.changeItem(pendingTrash.uuid, (mutator) => {
      mutator.trashed = true;
    });
    const criteria = NotesDisplayCriteria.Create({ includeTrashed: false });
    expect(
      notesMatchingCriteria(criteria, itemManager.collection).length
    ).toBe(1);
  });

  it('includeTrashed on', async function () {
    await createNote();
    const pendingTrash = await createNote();
    await itemManager.changeItem(pendingTrash.uuid, (mutator) => {
      mutator.trashed = true;
    });
    const criteria = NotesDisplayCriteria.Create({ includeTrashed: true });
    expect(
      notesMatchingCriteria(criteria, itemManager.collection).length
    ).toBe(2);
  });

  it('includeArchived off', async function () {
    await createNote();
    const pendingArchive = await createNote();
    await itemManager.changeItem(pendingArchive.uuid, (mutator) => {
      mutator.archived = true;
    });
    const criteria = NotesDisplayCriteria.Create({ includeArchived: false });
    expect(
      notesMatchingCriteria(criteria, itemManager.collection).length
    ).toBe(1);
  });

  it('includeArchived on', async function () {
    await createNote();
    const pendingArchive = await createNote();
    await itemManager.changeItem(pendingArchive.uuid, (mutator) => {
      mutator.archived = true;
    });
    const criteria = NotesDisplayCriteria.Create({
      includeArchived: true,
    });
    expect(
      notesMatchingCriteria(criteria, itemManager.collection).length
    ).toBe(2);
  });

  it('protectedSearchEnabled false', async function () {
    const normal = await createNote('hello', 'world');
    await itemManager.changeItem(normal.uuid, (mutator) => {
      mutator.protected = true;
    });
    const criteria = NotesDisplayCriteria.Create({
      searchQuery: { query: 'world', includeProtectedNoteText: false },
    });
    expect(
      notesMatchingCriteria(criteria, itemManager.collection).length
    ).toBe(0);
  });

  it('protectedSearchEnabled true', async function () {
    const normal = await createNote();
    await itemManager.changeItem(normal.uuid, (mutator) => {
      mutator.protected = true;
    });
    const criteria = NotesDisplayCriteria.Create({
      searchQuery: { query: 'world', includeProtectedNoteText: true },
    });
    expect(
      notesMatchingCriteria(criteria, itemManager.collection).length
    ).toBe(1);
  });

  it('tags', async function () {
    const note = await createNote();
    const tag = await createTag([note]);
    const looseTag = await createTag([], 'loose');

    const matchingCriteria = NotesDisplayCriteria.Create({
      tags: [tag],
    });
    expect(
      notesMatchingCriteria(matchingCriteria, itemManager.collection)
        .length
    ).toBe(1);

    const nonmatchingCriteria = NotesDisplayCriteria.Create({
      tags: [looseTag],
    });
    expect(
      notesMatchingCriteria(nonmatchingCriteria, itemManager.collection)
        .length
    ).toBe(0);
  });

  describe('smart tags', function () {
    it('normal note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      await createNote();
      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [archivedTag],
          }),
          itemManager.collection
        ).length
      ).toBe(0);
    });

    it('trashed note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      const normal = await createNote();
      await itemManager.changeItem(normal.uuid, (mutator) => {
        mutator.trashed = true;
      });

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [archivedTag],
          }),
          itemManager.collection
        ).length
      ).toBe(0);
    });

    it('archived note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      const normal = await createNote();
      await itemManager.changeItem(normal.uuid, (mutator) => {
        mutator.trashed = false;
        mutator.archived = true;
      });
      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [archivedTag],
          }),
          itemManager.collection
        ).length
      ).toBe(1);
    });

    it('archived + trashed note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      const normal = await createNote();
      await itemManager.changeItem(normal.uuid, (mutator) => {
        mutator.trashed = true;
        mutator.archived = true;
      });
      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [archivedTag],
          }),
          itemManager.collection
        ).length
      ).toBe(0);
    });
  });

  describe('includeTrash', function () {
    it('normal note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);

      await createNote();

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeTrashed: true,
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
            includeTrashed: true,
          }),
          itemManager.collection
        ).length
      ).toBe(0);
    });

    it('trashed note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      const normal = await createNote();

      await itemManager.changeItem(normal.uuid, (mutator) => {
        mutator.trashed = true;
      });

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeTrashed: false,
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeTrashed: true,
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
            includeTrashed: true,
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [archivedTag],
            includeTrashed: true,
          }),
          itemManager.collection
        ).length
      ).toBe(0);
    });

    it('archived + trashed note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      const normal = await createNote();

      await itemManager.changeItem(normal.uuid, (mutator) => {
        mutator.trashed = true;
        mutator.archived = true;
      });
      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeTrashed: true,
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
            includeTrashed: true,
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [archivedTag],
            includeTrashed: true,
          }),
          itemManager.collection
        ).length
      ).toBe(1);
    });
  });

  describe('includeArchived', function () {
    it('normal note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);

      await createNote();

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(0);
    });

    it('archived note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      const normal = await createNote();
      await itemManager.changeItem(normal.uuid, (mutator) => {
        mutator.archived = true;
      });

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeArchived: false,
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [archivedTag],
            includeArchived: false,
          }),
          itemManager.collection
        ).length
      ).toBe(1);
    });

    it('archived + trashed note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      const normal = await createNote();
      await itemManager.changeItem(normal.uuid, (mutator) => {
        mutator.trashed = true;
        mutator.archived = true;
      });

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [archivedTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(0);
    });
  });

  describe.skip('multiple tags', function () {
    it('normal note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      await createNote();

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag, trashTag, archivedTag],
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
          }),
          itemManager.collection
        ).length
      ).toBe(0);
    });

    it('archived note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      const normal = await createNote();
      await itemManager.changeItem(normal.uuid, (mutator) => {
        mutator.archived = true;
      });

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeArchived: false,
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [archivedTag],
            includeArchived: false,
          }),
          itemManager.collection
        ).length
      ).toBe(1);
    });

    it('archived + trashed note', async function () {
      const systemTags = itemManager.systemSmartTags;
      const allTag = systemTags.find((t) => t.isAllTag);
      const trashTag = systemTags.find((t) => t.isTrashTag);
      const archivedTag = systemTags.find((t) => t.isArchiveTag);

      const normal = await createNote();
      await itemManager.changeItem(normal.uuid, (mutator) => {
        mutator.trashed = true;
        mutator.archived = true;
      });

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [allTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(0);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [trashTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(1);

      expect(
        notesMatchingCriteria(
          NotesDisplayCriteria.Create({
            tags: [archivedTag],
            includeArchived: true,
          }),
          itemManager.collection
        ).length
      ).toBe(0);
    });
  });
});
