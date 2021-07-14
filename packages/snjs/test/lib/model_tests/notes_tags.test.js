import { PayloadSource, CreateMaxPayloadFromAnyObject, NotesDisplayCriteria } from '@Lib/index';
import { ContentType, SNNote, SNPredicate } from '@Lib/models';
import * as Factory from '../../factory';

describe('notes and tags', () => {
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

  it('uses proper class for note', async function () {
    const payload = Factory.createNotePayload();
    await application.itemManager.emitItemFromPayload(
      payload,
      PayloadSource.LocalChanged
    );
    const note = application.itemManager.getItems([ContentType.Note])[0];
    expect(note.constructor === SNNote).toBe(true);
  });

  it('properly constructs syncing params', async function () {
    const title = 'Foo';
    const text = 'Bar';
    const note = await application.createTemplateItem(ContentType.Note, {
      title,
      text,
    });

    expect(note.content.title).toBe(title);
    expect(note.content.text).toBe(text);

    const tag = await application.createTemplateItem(ContentType.Tag, {
      title,
    });

    expect(tag.title).toBe(title);
  });

  it('properly handles legacy relationships', async function () {
    // legacy relationships are when a note has a reference to a tag
    const pair = Factory.createRelatedNoteTagPairPayload();
    const notePayload = pair[0];
    const tagPayload = pair[1];

    const mutatedTag = CreateMaxPayloadFromAnyObject(tagPayload, {
      content: {
        ...tagPayload.safeContent,
        references: null,
      },
    });
    const mutatedNote = CreateMaxPayloadFromAnyObject(notePayload, {
      content: {
        references: [
          {
            uuid: tagPayload.uuid,
            content_type: tagPayload.content_type,
          },
        ],
      },
    });

    await application.itemManager.emitItemsFromPayloads(
      [mutatedNote, mutatedTag],
      PayloadSource.LocalChanged
    );
    const note = application.itemManager.getItems([ContentType.Note])[0];
    const tag = application.itemManager.getItems([ContentType.Tag])[0];

    expect(note.content.references.length).toBe(1);
    expect(
      application.itemManager.itemsReferencingItem(tag.uuid).length
    ).toBe(1);
  });

  it('creates relationship between note and tag', async function () {
    const pair = Factory.createRelatedNoteTagPairPayload({ dirty: false });
    const notePayload = pair[0];
    const tagPayload = pair[1];

    expect(notePayload.content.references.length).toBe(0);
    expect(tagPayload.content.references.length).toBe(1);

    await application.itemManager.emitItemsFromPayloads(
      [notePayload, tagPayload],
      PayloadSource.LocalChanged
    );
    let note = application.itemManager.notes[0];
    let tag = application.itemManager.tags[0];

    expect(note.dirty).toBeFalsy();
    expect(tag.dirty).toBeFalsy();

    expect(note.content.references.length).toBe(0);
    expect(tag.content.references.length).toBe(1);

    expect(note.hasRelationshipWithItem(tag)).toBe(false);
    expect(tag.hasRelationshipWithItem(note)).toBe(true);

    expect(
      application.itemManager.itemsReferencingItem(note.uuid).length
    ).toBe(1);
    expect(note.payload.safeReferences.length).toBe(0);
    expect(tag.noteCount).toBe(1);

    note = await application.itemManager.setItemToBeDeleted(note.uuid);
    tag = application.itemManager.tags[0];

    expect(note.dirty).toBe(true);
    expect(tag.dirty).toBe(true);
    await application.syncService.sync(syncOptions);
    expect(tag.content.references.length).toBe(0);
    expect(
      application.itemManager.itemsReferencingItem(note.uuid).length
    ).toBe(0);
    expect(tag.noteCount).toBe(0);

    note = application.itemManager.notes[0];
    tag = application.itemManager.tags[0];
    expect(note).toBeFalsy();
    expect(tag.dirty).toBe(false);
  });

  it('handles remote deletion of relationship', async function () {
    const pair = Factory.createRelatedNoteTagPairPayload();
    const notePayload = pair[0];
    const tagPayload = pair[1];

    await application.itemManager.emitItemsFromPayloads(
      pair,
      PayloadSource.LocalChanged
    );
    let note = application.itemManager.getItems([ContentType.Note])[0];
    let tag = application.itemManager.getItems([ContentType.Tag])[0];

    expect(note.content.references.length).toBe(0);
    expect(tag.content.references.length).toBe(1);

    await application.syncService.sync(syncOptions);

    const mutatedTag = CreateMaxPayloadFromAnyObject(tagPayload, {
      dirty: false,
      content: {
        ...tagPayload.safeContent,
        references: [],
      },
    });
    await application.itemManager.emitItemsFromPayloads(
      [mutatedTag],
      PayloadSource.LocalChanged
    );

    note = application.itemManager.findItem(note.uuid);
    tag = application.itemManager.findItem(tag.uuid);

    expect(tag.content.references.length).toBe(0);
    expect(
      application.itemManager.itemsReferencingItem(note.uuid).length
    ).toBe(0);
    expect(tag.noteCount).toBe(0);

    // expect to be false
    expect(note.dirty).toBeFalsy();
    expect(tag.dirty).toBeFalsy();
  });

  it('creating basic note should have text set', async function () {
    const note = await Factory.createMappedNote(application);
    expect(note.title).toBeTruthy();
    expect(note.text).toBeTruthy();
  });

  it('creating basic tag should have title', async function () {
    const tag = await Factory.createMappedTag(application);
    expect(tag.title).toBeTruthy();
  });

  it('handles removing relationship between note and tag', async function () {
    const pair = Factory.createRelatedNoteTagPairPayload();
    const notePayload = pair[0];
    const tagPayload = pair[1];

    await application.itemManager.emitItemsFromPayloads(
      [notePayload, tagPayload],
      PayloadSource.LocalChanged
    );
    const note = application.itemManager.getItems([ContentType.Note])[0];
    let tag = application.itemManager.getItems([ContentType.Tag])[0];

    expect(note.content.references.length).toBe(0);
    expect(tag.content.references.length).toBe(1);

    tag = await application.changeAndSaveItem(
      tag.uuid,
      (mutator) => {
        mutator.removeItemAsRelationship(note);
      },
      undefined,
      undefined,
      syncOptions
    );

    expect(
      application.itemManager.itemsReferencingItem(note.uuid).length
    ).toBe(0);
    expect(tag.noteCount).toBe(0);
  });

  it('properly handles tag duplication', async function () {
    const pair = Factory.createRelatedNoteTagPairPayload();
    await application.itemManager.emitItemsFromPayloads(
      pair,
      PayloadSource.LocalChanged
    );
    let note = application.itemManager.notes[0];
    let tag = application.itemManager.tags[0];

    const duplicateTag = await application.itemManager.duplicateItem(
      tag.uuid,
      true
    );
    await application.syncService.sync(syncOptions);

    note = application.itemManager.findItem(note.uuid);
    tag = application.itemManager.findItem(tag.uuid);

    expect(tag.uuid).not.toBe(duplicateTag.uuid);
    expect(tag.content.references.length).toBe(1);
    expect(tag.noteCount).toBe(1);
    expect(duplicateTag.content.references.length).toBe(1);
    expect(duplicateTag.noteCount).toBe(1);

    const noteTags = application.itemManager.itemsReferencingItem(
      note.uuid
    );
    expect(noteTags.length).toBe(2);

    const noteTag1 = noteTags[0];
    const noteTag2 = noteTags[1];
    expect(noteTag1.uuid).not.toBe(noteTag2.uuid);

    // expect to be false
    expect(note.dirty).toBeFalsy();
    expect(tag.dirty).toBeFalsy();
  });

  it('duplicating a note should maintain its tag references', async function () {
    const pair = Factory.createRelatedNoteTagPairPayload();
    const notePayload = pair[0];
    const tagPayload = pair[1];
    await application.itemManager.emitItemsFromPayloads(
      [notePayload, tagPayload],
      PayloadSource.LocalChanged
    );
    const note = application.itemManager.getItems([ContentType.Note])[0];
    const duplicateNote = await application.itemManager.duplicateItem(
      note.uuid,
      true
    );
    expect(note.uuid).not.toBe(duplicateNote.uuid);

    expect(
      application.itemManager.itemsReferencingItem(duplicateNote.uuid)
        .length
    ).toBe(application.itemManager.itemsReferencingItem(note.uuid).length);
  });

  it('deleting a note should update tag references', async function () {
    const pair = Factory.createRelatedNoteTagPairPayload();
    const notePayload = pair[0];
    const tagPayload = pair[1];
    await application.itemManager.emitItemsFromPayloads(
      [notePayload, tagPayload],
      PayloadSource.LocalChanged
    );
    const note = application.itemManager.getItems([ContentType.Note])[0];
    let tag = application.itemManager.getItems([ContentType.Tag])[0];

    expect(tag.content.references.length).toBe(1);
    expect(tag.noteCount).toBe(1);

    expect(note.content.references.length).toBe(0);
    expect(
      application.itemManager.itemsReferencingItem(note.uuid).length
    ).toBe(1);

    await application.itemManager.setItemToBeDeleted(tag.uuid);
    tag = application.itemManager.findItem(tag.uuid);
    expect(tag.content).toBeFalsy();
  });

  it('modifying item content should not modify payload content', async function () {
    const notePayload = Factory.createNotePayload();
    await application.itemManager.emitItemsFromPayloads(
      [notePayload],
      PayloadSource.LocalChanged
    );
    let note = application.itemManager.getItems([ContentType.Note])[0];
    note = await application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        mutator.content.title = Math.random();
      },
      undefined,
      undefined,
      syncOptions
    );
    expect(note.content.title).not.toBe(notePayload.content.title);
  });

  it('deleting a tag should not dirty notes', async function () {
    // Tags now reference notes, but it used to be that tags referenced notes and notes referenced tags.
    // After the change, there was an issue where removing an old tag relationship from a note would only
    // remove one way, and thus keep it intact on the visual level.
    const pair = Factory.createRelatedNoteTagPairPayload();
    const notePayload = pair[0];
    const tagPayload = pair[1];

    await application.itemManager.emitItemsFromPayloads(
      [notePayload, tagPayload],
      PayloadSource.LocalChanged
    );
    let note = application.itemManager.getItems([ContentType.Note])[0];
    let tag = application.itemManager.getItems([ContentType.Tag])[0];

    await application.syncService.sync(syncOptions);
    await application.itemManager.setItemToBeDeleted(tag.uuid);

    note = application.itemManager.findItem(note.uuid);
    tag = application.itemManager.findItem(tag.uuid);

    expect(tag.dirty).toBe(true);
    expect(note.dirty).toBeFalsy();
  });

  it('should sort notes', async function () {
    await Promise.all(
      ['Y', 'Z', 'A', 'B'].map(async (title) => {
        return application.insertItem(
          await application.createTemplateItem(ContentType.Note, { title })
        );
      })
    );
    application.setNotesDisplayCriteria(
      NotesDisplayCriteria.Create({
        sortProperty: 'title',
        sortDirection: 'dsc',
      })
    );
    const titles = application
      .getDisplayableItems(ContentType.Note)
      .map((note) => note.title);
    expect(titles).toEqual(['A', 'B', 'Y', 'Z']);
  });

  it('setting a note dirty should collapse its properties into content', async function () {
    let note = await application.createTemplateItem(ContentType.Note, {
      title: 'Foo',
    });
    await application.insertItem(note);
    note = application.itemManager.findItem(note.uuid);
    expect(note.content.title).toBe('Foo');
  });

  describe('Tags', function () {
    it('should sort tags in ascending alphabetical order by default', async function () {
      const titles = ['1', 'A', 'a', 'b', '1', '2', 'B'];
      const sortedTitles = titles.sort((a, b) => a.localeCompare(b));
      await Promise.all(
        titles.map((title) => application.findOrCreateTag(title))
      );
      expect(
        application
          .getDisplayableItems(ContentType.Tag)
          .map((t) => t.title)
      ).toEqual(sortedTitles);
    });

    it('should sort tags in reverse alphabetical order', async function () {
      const titles = ['1', 'A', 'a', 'b', '1', '2', 'B'];
      const sortedTitles = titles.sort((a, b) => b.localeCompare(a));
      await Promise.all(
        titles.map((title) => application.findOrCreateTag(title))
      );
      application.setDisplayOptions(ContentType.Tag, 'title', 'asc');
      expect(
        application
          .getDisplayableItems(ContentType.Tag)
          .map((t) => t.title)
      ).toEqual(sortedTitles);
    });

    it('should match a tag', async function () {
      const taggedNote = await Factory.createMappedNote(application);
      const tag = await application.findOrCreateTag('A');
      await application.changeItem(tag.uuid, (mutator) => {
        mutator.addItemAsRelationship(taggedNote);
      });
      await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'dsc',
          tags: [tag],
        })
      );
      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes.length).toBe(1);
      expect(displayedNotes[0].uuid).toBe(taggedNote.uuid);
    });

    it('should not show trashed notes when displaying a tag', async function () {
      const taggedNote = await Factory.createMappedNote(application);
      const trashedNote = await Factory.createMappedNote(application);
      const tag = await application.findOrCreateTag('A');
      await application.changeItem(tag.uuid, (mutator) => {
        mutator.addItemAsRelationship(taggedNote);
        mutator.addItemAsRelationship(trashedNote);
      });
      await application.changeItem(trashedNote.uuid, (mutator) => {
        mutator.trashed = true;
      });
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'dsc',
          tags: [tag],
        })
      );
      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes.length).toBe(1);
      expect(displayedNotes[0].uuid).toBe(taggedNote.uuid);
    });

    it('should sort notes when displaying tag', async function () {
      await Promise.all(
        ['Y', 'Z', 'A', 'B'].map(async (title) => {
          return application.insertItem(
            await application.createTemplateItem(ContentType.Note, {
              title,
            })
          );
        })
      );
      const Bnote = application.itemManager.notes.find(
        (note) => note.title === 'B'
      );
      await application.changeItem(Bnote.uuid, (mutator) => {
        mutator.pinned = true;
      });
      const tag = await application.findOrCreateTag('A');
      await application.changeItem(tag.uuid, (mutator) => {
        for (const note of application.itemManager.notes) {
          mutator.addItemAsRelationship(note);
        }
      });

      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'dsc',
          tags: [tag],
        })
      );

      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes).toHaveLength(4);
      expect(displayedNotes[0].title).toBe('B');
      expect(displayedNotes[1].title).toBe('A');
    });
  });

  describe('Smart tags', function () {
    it('"title", "startsWith", "Foo"', async function () {
      const note = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'Foo 🎲',
        })
      );
      await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'Not Foo 🎲',
        })
      );
      const smartTag = await application.insertItem(
        await application.createTemplateItem(ContentType.SmartTag, {
          title: 'Foo Notes',
          predicate: {
            keypath: 'title',
            operator: 'startsWith',
            value: 'Foo',
          },
        })
      );
      const matches = application.notesMatchingSmartTag(smartTag);
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'asc',
          tags: [smartTag],
        })
      );

      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes).toEqual(matches);
      expect(matches.length).toBe(1);
      expect(matches[0].uuid).toBe(note.uuid);
    });

    it('"pinned", "=", true', async function () {
      const note = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );
      await application.changeItem(note.uuid, (mutator) => {
        mutator.pinned = true;
      });
      await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'B',
          pinned: false,
        })
      );
      const smartTag = await application.insertItem(
        await application.createTemplateItem(ContentType.SmartTag, {
          title: 'Pinned',
          predicate: {
            keypath: 'pinned',
            operator: '=',
            value: true,
          },
        })
      );
      const matches = application.notesMatchingSmartTag(smartTag);
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'asc',
          tags: [smartTag],
        })
      );

      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes).toEqual(matches);
      expect(matches.length).toBe(1);
      expect(matches[0].uuid).toBe(note.uuid);
    });

    it('"pinned", "=", false', async function () {
      const pinnedNote = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );
      await application.changeItem(pinnedNote.uuid, (mutator) => {
        mutator.pinned = true;
      });
      const unpinnedNote = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'B',
        })
      );
      const smartTag = await application.insertItem(
        await application.createTemplateItem(ContentType.SmartTag, {
          title: 'Not pinned',
          predicate: {
            keypath: 'pinned',
            operator: '=',
            value: false,
          },
        })
      );
      const matches = application.notesMatchingSmartTag(smartTag);
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'asc',
          tags: [smartTag],
        })
      );

      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes).toEqual(matches);
      expect(matches.length).toBe(1);
      expect(matches[0].uuid).toBe(unpinnedNote.uuid);
    });

    it('"text.length", ">", 500', async function () {
      const longNote = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
          text: Array(501).fill(0).join(''),
        })
      );
      await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'B',
          text: 'b',
        })
      );
      const smartTag = await application.insertItem(
        await application.createTemplateItem(ContentType.SmartTag, {
          title: 'Long',
          predicate: {
            keypath: 'text.length',
            operator: '>',
            value: 500,
          },
        })
      );
      const matches = application.notesMatchingSmartTag(smartTag);
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'asc',
          tags: [smartTag],
        })
      );
      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes).toEqual(matches);
      expect(matches.length).toBe(1);
      expect(matches[0].uuid).toBe(longNote.uuid);
    });

    it('"updated_at", ">", "1.days.ago"', async function () {
      await Factory.registerUserToApplication({
        application: application,
        email: Factory.generateUuid(),
        password: Factory.generateUuid(),
      });
      const recentNote = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );
      await application.sync();
      const olderNote = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'B',
          text: 'b',
        })
      );
      await application.changeItem(olderNote.uuid, (mutator) => {
        const threeDays = 3 * 24 * 60 * 60 * 1000;
        mutator.updated_at = new Date(Date.now() - threeDays);
      });

      /** Create an unsynced note which shouldn't get an updated_at */
      await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'B',
          text: 'b',
        })
      );
      const smartTag = await application.insertItem(
        await application.createTemplateItem(ContentType.SmartTag, {
          title: 'One day ago',
          predicate: {
            keypath: 'serverUpdatedAt',
            operator: '>',
            value: '1.days.ago',
          },
        })
      );
      const matches = application.notesMatchingSmartTag(smartTag);
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'asc',
          tags: [smartTag],
        })
      );
      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes).toEqual(matches);
      expect(matches.length).toBe(1);
      expect(matches[0].uuid).toBe(recentNote.uuid);
    });

    it('"tags.length", "=", 0', async function () {
      const untaggedNote = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );
      const taggedNote = await Factory.createMappedNote(application);
      const tag = await application.findOrCreateTag('A');
      await application.changeItem(tag.uuid, (mutator) => {
        mutator.addItemAsRelationship(taggedNote);
      });

      const smartTag = await application.insertItem(
        await application.createTemplateItem(ContentType.SmartTag, {
          title: 'Untagged',
          predicate: {
            keypath: 'tags.length',
            operator: '=',
            value: 0,
          },
        })
      );
      const matches = application.notesMatchingSmartTag(smartTag);
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'asc',
          tags: [smartTag],
        })
      );
      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes).toEqual(matches);
      expect(matches.length).toBe(1);
      expect(matches[0].uuid).toBe(untaggedNote.uuid);
    });

    it('"tags", "includes", ["title", "startsWith", "b"]', async function () {
      const taggedNote = await Factory.createMappedNote(application);
      const tag = await application.findOrCreateTag('B');
      await application.changeItem(tag.uuid, (mutator) => {
        mutator.addItemAsRelationship(taggedNote);
      });
      await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );

      const smartTag = await application.insertItem(
        await application.createTemplateItem(ContentType.SmartTag, {
          title: 'B-tags',
          predicate: {
            keypath: 'tags',
            operator: 'includes',
            value: ['title', 'startsWith', 'B'],
          },
        })
      );
      const matches = application.notesMatchingSmartTag(smartTag);
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'asc',
          tags: [smartTag],
        })
      );
      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes).toEqual(matches);
      expect(matches.length).toBe(1);
      expect(matches[0].uuid).toBe(taggedNote.uuid);
    });

    it('"ignored", "and", [["pinned", "=", true], ["locked", "=", true]]', async function () {
      const pinnedAndLockedNote = await Factory.createMappedNote(
        application
      );
      await application.changeItem(pinnedAndLockedNote.uuid, (mutator) => {
        mutator.pinned = true;
        mutator.locked = true;
      });

      const pinnedNote = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );
      await application.changeItem(pinnedNote.uuid, (mutator) => {
        mutator.pinned = true;
      });

      const lockedNote = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );
      await application.changeItem(lockedNote.uuid, (mutator) => {
        mutator.locked = true;
      });

      const smartTag = await application.insertItem(
        await application.createTemplateItem(ContentType.SmartTag, {
          title: 'Pinned & Locked',
          predicate: SNPredicate.FromArray([
            'ignored',
            'and',
            [
              ['pinned', '=', true],
              ['locked', '=', true],
            ],
          ]),
        })
      );
      const matches = application.notesMatchingSmartTag(smartTag);
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'title',
          sortDirection: 'asc',
          tags: [smartTag],
        })
      );
      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes).toEqual(matches);
      expect(matches.length).toBe(1);
      expect(matches[0].uuid).toBe(pinnedAndLockedNote.uuid);
    });

    it('"ignored", "or", [["content.protected", "=", true], ["pinned", "=", true]]', async function () {
      const protectedNote = await Factory.createMappedNote(application);
      await application.changeItem(protectedNote.uuid, (mutator) => {
        mutator.protected = true;
      });

      const pinnedNote = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );
      await application.changeItem(pinnedNote.uuid, (mutator) => {
        mutator.pinned = true;
      });

      const pinnedAndProtectedNote = await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );
      await application.changeItem(
        pinnedAndProtectedNote.uuid,
        (mutator) => {
          mutator.pinned = true;
          mutator.protected = true;
        }
      );

      await application.insertItem(
        await application.createTemplateItem(ContentType.Note, {
          title: 'A',
        })
      );

      const smartTag = await application.insertItem(
        await application.createTemplateItem(ContentType.SmartTag, {
          title: 'Protected or Pinned',
          predicate: SNPredicate.FromArray([
            'ignored',
            'or',
            [
              ['content.protected', '=', true],
              ['pinned', '=', true],
            ],
          ]),
        })
      );
      const matches = application.notesMatchingSmartTag(smartTag);
      application.setNotesDisplayCriteria(
        NotesDisplayCriteria.Create({
          sortProperty: 'created_at',
          sortDirection: 'asc',
          tags: [smartTag],
        })
      );
      const displayedNotes = application.getDisplayableItems(
        ContentType.Note
      );
      expect(displayedNotes.length).toBe(matches.length);
      expect(matches.length).toBe(3);
      expect(matches.find((note) => note.uuid === protectedNote.uuid)).toBeDefined();
      expect(matches.find((note) => note.uuid === pinnedNote.uuid)).toBeDefined();
      expect(matches.find((note) => note.uuid === pinnedAndProtectedNote.uuid)).toBeDefined();
    });
  });
});