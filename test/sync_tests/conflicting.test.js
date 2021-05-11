/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
import * as Factory from '../lib/factory.js';
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('online conflict handling', function () {
  this.timeout(Factory.TestTimeout);
  const BASE_ITEM_COUNT = 2; /** Default items key, user preferences */

  const syncOptions = {
    checkIntegrity: true,
    awaitAll: true,
  };

  beforeEach(async function () {
    localStorage.clear();
    this.expectedItemCount = BASE_ITEM_COUNT;
    this.application = await Factory.createInitAppWithRandNamespace();
    this.email = Uuid.GenerateUuidSynchronously();
    this.password = Uuid.GenerateUuidSynchronously();
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });
    this.sharedFinalAssertions = async function () {
      expect(this.application.syncService.isOutOfSync()).to.equal(false);
      const items = this.application.itemManager.items;
      expect(items.length).to.equal(this.expectedItemCount);
      const rawPayloads = await this.application.storageService.getAllRawPayloads();
      expect(rawPayloads.length).to.equal(this.expectedItemCount);
    };
  });

  afterEach(async function () {
    await this.application.deinit();
    localStorage.clear();
  });

  function createDirtyPayload(contentType) {
    const params = {
      uuid: Uuid.GenerateUuidSynchronously(),
      content_type: contentType,
      content: {
        foo: 'bar',
      },
    };
    const payload = CreateMaxPayloadFromAnyObject(params, {
      dirty: true,
      dirtiedDate: new Date(),
    });
    return payload;
  }

  it('components should not be duplicated under any circumstances', async function () {
    const payload = createDirtyPayload(ContentType.Component);
    const item = await this.application.itemManager.emitItemFromPayload(
      payload,
      PayloadSource.LocalChanged
    );
    this.expectedItemCount++;
    await this.application.syncService.sync(syncOptions);
    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(item.uuid, (mutator) => {
      mutator.content.foo = `${Math.random()}`;
    });
    await this.application.changeAndSaveItem(
      item.uuid,
      (mutator) => {
        /** Conflict the item */
        mutator.content.foo = 'zar';
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      },
      undefined,
      undefined,
      syncOptions
    );
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    await this.sharedFinalAssertions();
  });

  it('items keys should not be duplicated under any circumstances', async function () {
    const payload = createDirtyPayload(ContentType.ItemsKey);
    const item = await this.application.itemManager.emitItemFromPayload(
      payload,
      PayloadSource.LocalChanged
    );
    this.expectedItemCount++;
    await this.application.syncService.sync(syncOptions);
    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(item.uuid, (mutator) => {
      mutator.title = `${Math.random()}`;
    });
    await this.application.changeAndSaveItem(
      item.uuid,
      (mutator) => {
        /** Conflict the item */
        mutator.content.foo = 'zar';
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      },
      undefined,
      undefined,
      syncOptions
    );
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    await this.sharedFinalAssertions();
  });

  it('duplicating note should maintain editor ref', async function () {
    const note = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;
    const basePayload = createDirtyPayload(ContentType.Component);
    const payload = CopyPayload(basePayload, {
      content: {
        ...basePayload.content,
        area: ComponentArea.Editor,
      },
    });
    const editor = await this.application.itemManager.emitItemFromPayload(
      payload,
      PayloadSource.LocalChanged
    );
    this.expectedItemCount++;
    await this.application.syncService.sync(syncOptions);

    await this.application.changeAndSaveItem(
      editor.uuid,
      (mutator) => {
        mutator.associateWithItem(note.uuid);
      },
      undefined,
      undefined,
      syncOptions
    );

    expect(this.application.componentManager.editorForNote(note)).to.be.ok;

    /** Conflict the note */
    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(note.uuid, (mutator) => {
      mutator.title = `${Math.random()}`;
    });
    await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        mutator.content.title = 'zar';
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      },
      undefined,
      undefined,
      syncOptions
    );
    this.expectedItemCount++;

    const duplicate = this.application.itemManager.notes.find((n) => {
      return n.uuid !== note.uuid;
    });
    expect(duplicate).to.be.ok;
    expect(this.application.componentManager.editorForNote(duplicate)).to.be.ok;
    await this.sharedFinalAssertions();
  });

  it('should create conflicted copy if incoming server item attempts to overwrite local dirty item', async function () {
    // create an item and sync it
    const note = await Factory.createMappedNote(this.application);
    this.expectedItemCount++;
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);

    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(this.expectedItemCount);

    const originalValue = note.title;
    const dirtyValue = `${Math.random()}`;

    await this.application.itemManager.changeNote(note.uuid, (mutator) => {
      // modify this item locally to have differing contents from server
      mutator.title = dirtyValue;
      // Intentionally don't change updated_at. We want to simulate a chaotic case where
      // for some reason we receive an item with different content but the same updated_at.
      // note.updated_at = Factory.yesterday();
    });

    // Download all items from the server, which will include this note.
    await this.application.syncService.clearSyncPositionTokens();
    await this.application.syncService.sync({
      ...syncOptions,
      awaitAll: true,
    });

    // We expect this item to be duplicated
    this.expectedItemCount++;
    expect(this.application.itemManager.notes.length).to.equal(2);

    const allItems = this.application.itemManager.items;
    expect(allItems.length).to.equal(this.expectedItemCount);

    const originalItem = this.application.itemManager.findItem(note.uuid);
    const duplicateItem = allItems.find(
      (i) => i.content.conflict_of === note.uuid
    );

    expect(originalItem.title).to.equal(dirtyValue);
    expect(duplicateItem.title).to.equal(originalValue);
    expect(originalItem.title).to.not.equal(duplicateItem.title);

    const newRawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(newRawPayloads.length).to.equal(this.expectedItemCount);
    await this.sharedFinalAssertions();
  });

  it('should handle sync conflicts by duplicating differing data', async function () {
    // create an item and sync it
    const note = await Factory.createMappedNote(this.application);
    await this.application.saveItem(note.uuid);
    this.expectedItemCount++;

    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(this.expectedItemCount);
    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(note.uuid, (mutator) => {
      mutator.title = `${Math.random()}`;
    });
    await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        // modify this item to have stale values
        mutator.title = `${Math.random()}`;
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      },
      undefined,
      undefined,
      syncOptions
    );

    // We expect this item to be duplicated
    this.expectedItemCount++;
    const allItems = this.application.itemManager.items;
    expect(allItems.length).to.equal(this.expectedItemCount);

    const note1 = this.application.itemManager.notes[0];
    const note2 = this.application.itemManager.notes[1];
    expect(note1.content.title).to.not.equal(note2.content.title);
    await this.sharedFinalAssertions();
  });

  it('basic conflict with clearing local state', async function () {
    const note = await Factory.createMappedNote(this.application);
    await this.application.saveItem(note.uuid);
    this.expectedItemCount += 1;
    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(note.uuid, (mutator) => {
      mutator.title = `${Math.random()}`;
    });
    await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        /** Create conflict for a note */
        mutator.title = `${Math.random()}`;
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      },
      undefined,
      undefined,
      syncOptions
    );

    this.expectedItemCount++;
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );

    // clear sync token, clear storage, download all items, and ensure none of them have error decrypting
    await this.application.syncService.clearSyncPositionTokens();
    await this.application.storageService.clearAllPayloads();
    await this.application.payloadManager.resetState();
    await this.application.itemManager.resetState();
    await this.application.syncService.sync(syncOptions);

    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    await this.sharedFinalAssertions();
  });

  it('should duplicate item if saving a modified item and clearing our sync token', async function () {
    let note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);
    this.expectedItemCount++;

    const newTitle = `${Math.random()}`;
    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(note.uuid, (mutator) => {
      mutator.title = `${Math.random()}`;
    });
    await this.application.itemManager.changeItem(note.uuid, (mutator) => {
      // modify this item to have stale values
      mutator.title = newTitle;
      mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
    });

    // We expect this item to be duplicated
    this.expectedItemCount++;

    await this.application.syncService.clearSyncPositionTokens();
    await this.application.syncService.sync(syncOptions);

    note = this.application.findItem(note.uuid);
    // We expect the item title to be the new title, and not rolled back to original value
    expect(note.content.title).to.equal(newTitle);

    const allItems = this.application.itemManager.items;
    expect(allItems.length).to.equal(this.expectedItemCount);
    await this.sharedFinalAssertions();
  });

  it('should handle sync conflicts by not duplicating same data', async function () {
    const note = await Factory.createMappedNote(this.application);
    this.expectedItemCount++;
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);

    // keep item as is and set dirty
    await this.application.itemManager.setItemDirty(note.uuid);

    // clear sync token so that all items are retrieved on next sync
    this.application.syncService.clearSyncPositionTokens();

    await this.application.syncService.sync(syncOptions);
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    await this.sharedFinalAssertions();
  });

  it('clearing conflict_of on two clients simultaneously should keep us in sync', async function () {
    const note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    this.expectedItemCount++;

    await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        // client A
        mutator.content.conflict_of = 'foo';
      },
      undefined,
      undefined,
      syncOptions
    );

    // client B
    await this.application.syncService.clearSyncPositionTokens();
    await this.application.itemManager.changeItem(
      note.uuid,
      (mutator) => {
        mutator.content.conflict_of = 'bar';
      },
      undefined,
      undefined,
      syncOptions
    );

    // conflict_of is a key to ignore when comparing content, so item should
    // not be duplicated.
    await this.application.syncService.sync(syncOptions);
    await this.sharedFinalAssertions();
  });

  it('setting property on two clients simultaneously should create conflict', async function () {
    const note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    this.expectedItemCount++;

    await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        // client A
        mutator.content.foo = 'foo';
      },
      undefined,
      undefined,
      syncOptions
    );
    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(note.uuid, (mutator) => {
      mutator.title = `${Math.random()}`;
    });
    // client B
    await this.application.syncService.clearSyncPositionTokens();
    await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        mutator.content.foo = 'bar';
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      },
      undefined,
      undefined,
      syncOptions
    );
    this.expectedItemCount++;
    await this.sharedFinalAssertions();
  });

  it('if server says deleted but client says not deleted, keep server state', async function () {
    const note = await Factory.createMappedNote(this.application);
    const originalPayload = note.payloadRepresentation();
    this.expectedItemCount++;
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );

    // client A
    await this.application.itemManager.setItemToBeDeleted(note.uuid);
    await this.application.syncService.sync(syncOptions);
    this.expectedItemCount--;
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );

    // client B
    await this.application.syncService.clearSyncPositionTokens();
    // Add the item back and say it's not deleted
    const mutatedPayload = CreateMaxPayloadFromAnyObject(originalPayload, {
      deleted: false,
      updated_at: Factory.yesterday(),
    });
    await this.application.itemManager.emitItemsFromPayloads(
      [mutatedPayload],
      PayloadSource.LocalChanged
    );
    const resultNote = this.application.itemManager.findItem(note.uuid);
    expect(resultNote.uuid).to.equal(note.uuid);
    await this.application.itemManager.setItemDirty(resultNote.uuid);
    await this.application.syncService.sync(syncOptions);

    // We expect that this item is now gone for good, and a duplicate has not been created.
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    await this.sharedFinalAssertions();
  });

  it('if server says not deleted but client says deleted, keep server state', async function () {
    const note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    this.expectedItemCount++;

    // client A
    await this.application.syncService.sync(syncOptions);
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );

    // client B
    await this.application.syncService.clearSyncPositionTokens();

    // This client says this item is deleted, but the server is saying its not deleted.
    // In this case, we want to keep the server copy.
    await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        mutator.setDeleted();
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      },
      undefined,
      undefined,
      syncOptions
    );

    // We expect that this item maintained.
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    await this.sharedFinalAssertions();
  });

  it('should create conflict if syncing an item that is stale', async function () {
    let note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    await this.application.syncService.sync(syncOptions);
    note = this.application.findItem(note.uuid);
    expect(note.dirty).to.equal(false);
    this.expectedItemCount++;
    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(note.uuid, (mutator) => {
      mutator.title = `${Math.random()}`;
    });
    note = await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        mutator.text = 'Stale text';
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      },
      undefined,
      undefined,
      syncOptions
    );
    expect(note.dirty).to.equal(false);

    // We expect now that the item was conflicted
    this.expectedItemCount++;

    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(this.expectedItemCount);
    for (const payload of rawPayloads) {
      expect(payload.dirty).to.not.be.ok;
    }
    await this.sharedFinalAssertions();
  });

  it('creating conflict with exactly equal content should keep us in sync', async function () {
    const note = await Factory.createMappedNote(this.application);
    await this.application.itemManager.setItemDirty(note.uuid);
    this.expectedItemCount++;

    await this.application.syncService.sync(syncOptions);

    await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      },
      undefined,
      undefined,
      syncOptions
    );

    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    await this.sharedFinalAssertions();
  });

  it('handles stale data in bulk', async function () {
    /** This number must be greater than the pagination limit per sync request.
     * For example if the limit per request is 150 items sent/received, this number should
     * be something like 160. */
    const largeItemCount = this.application.syncService.upDownLimit + 10;
    await Factory.createManyMappedNotes(this.application, largeItemCount);
    /** Upload */
    await this.application.syncService.sync(syncOptions);
    this.expectedItemCount += largeItemCount;
    const items = this.application.itemManager.items;
    expect(items.length).to.equal(this.expectedItemCount);
    /**
     * We want to see what will happen if we upload everything we have to
     * the server as dirty, with no sync token, so that the server also
     * gives us everything it has.
     */
    const yesterday = Factory.yesterday();
    for (const note of this.application.itemManager.notes) {
      /** First modify the item without saving so that
       * our local contents digress from the server's */
      await this.application.itemManager.changeItem(note.uuid, (mutator) => {
        mutator.text = `1`;
      });
      await this.application.itemManager.changeItem(note.uuid, (mutator) => {
        mutator.text = `2`;
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(yesterday);
      });
      // We expect all the notes to be duplicated.
      this.expectedItemCount++;
    }
    await this.application.syncService.clearSyncPositionTokens();
    await this.application.syncService.sync(syncOptions);
    expect(this.application.itemManager.notes.length).to.equal(
      largeItemCount * 2
    );
    await this.sharedFinalAssertions();
  }).timeout(60000);

  it('duplicating an item should maintian its relationships', async function () {
    const payload1 = Factory.createStorageItemPayload(
      ContentType.ServerExtension
    );
    const payload2 = Factory.createStorageItemPayload(ContentType.UserPrefs);
    this.expectedItemCount -= 1; /** auto-created user preferences  */
    await this.application.itemManager.emitItemsFromPayloads(
      [payload1, payload2],
      PayloadSource.LocalChanged
    );
    this.expectedItemCount += 2;
    let serverExt = this.application.itemManager.getItems(
      ContentType.ServerExtension
    )[0];
    let userPrefs = this.application.itemManager.getItems(
      ContentType.UserPrefs
    )[0];
    expect(serverExt).to.be.ok;
    expect(userPrefs).to.be.ok;

    serverExt = await this.application.itemManager.changeItem(
      serverExt.uuid,
      (mutator) => {
        mutator.addItemAsRelationship(userPrefs);
      }
    );

    await this.application.itemManager.setItemDirty(userPrefs.uuid);
    userPrefs = this.application.findItem(userPrefs.uuid);

    expect(
      this.application.itemManager.itemsReferencingItem(userPrefs.uuid).length
    ).to.equal(1);
    expect(
      this.application.itemManager.itemsReferencingItem(userPrefs.uuid)
    ).to.include(serverExt);

    await this.application.syncService.sync(syncOptions);
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );

    serverExt = await this.application.itemManager.changeItem(
      serverExt.uuid,
      (mutator) => {
        mutator.content.title = `${Math.random()}`;
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      }
    );
    await this.application.syncService.sync({ ...syncOptions, awaitAll: true });

    // fooItem should now be conflicted and a copy created
    this.expectedItemCount++;
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    const rawPayloads = await this.application.storageService.getAllRawPayloads();
    expect(rawPayloads.length).to.equal(this.expectedItemCount);

    const fooItems = this.application.itemManager.getItems(
      ContentType.ServerExtension
    );
    const fooItem2 = fooItems[1];

    expect(fooItem2.content.conflict_of).to.equal(serverExt.uuid);
    // Two items now link to this original object
    const referencingItems = this.application.itemManager.itemsReferencingItem(
      userPrefs.uuid
    );
    expect(referencingItems.length).to.equal(2);
    expect(referencingItems[0]).to.not.equal(referencingItems[1]);

    expect(
      this.application.itemManager.itemsReferencingItem(serverExt.uuid).length
    ).to.equal(0);
    expect(
      this.application.itemManager.itemsReferencingItem(fooItem2.uuid).length
    ).to.equal(0);

    expect(serverExt.content.references.length).to.equal(1);
    expect(fooItem2.content.references.length).to.equal(1);
    expect(userPrefs.content.references.length).to.equal(0);

    expect(this.application.itemManager.getDirtyItems().length).to.equal(0);
    for (const item of this.application.itemManager.items) {
      expect(item.dirty).to.not.be.ok;
    }
    await this.sharedFinalAssertions();
  });

  it('when a note is conflicted, its tags should not be duplicated.', async function () {
    /**
     * If you have a note and a tag, and the tag has 1 reference to the note,
     * and you import the same two items, except modify the note value so that
     * a duplicate is created, we expect only the note to be duplicated,
     * and the tag not to.
     */
    let tag = await Factory.createMappedTag(this.application);
    let note = await Factory.createMappedNote(this.application);
    tag = await this.application.changeAndSaveItem(
      tag.uuid,
      (mutator) => {
        mutator.addItemAsRelationship(note);
      },
      undefined,
      undefined,
      syncOptions
    );
    await this.application.itemManager.setItemDirty(note.uuid);
    this.expectedItemCount += 2;

    await this.application.syncService.sync(syncOptions);

    // conflict the note
    const newText = `${Math.random()}`;
    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(note.uuid, (mutator) => {
      mutator.title = `${Math.random()}`;
    });
    note = await this.application.changeAndSaveItem(
      note.uuid,
      (mutator) => {
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
        mutator.text = newText;
      },
      undefined,
      undefined,
      syncOptions
    );

    // conflict the tag but keep its content the same
    tag = await this.application.changeAndSaveItem(
      tag.uuid,
      (mutator) => {
        mutator.updated_at_timestamp = Factory.dateToMicroseconds(Factory.yesterday());
      },
      undefined,
      undefined,
      syncOptions
    );
    /**
     * We expect now that the total item count has went up by just 1 (the note),
     * and not 2 (the note and tag)
     */
    this.expectedItemCount += 1;
    expect(this.application.itemManager.items.length).to.equal(
      this.expectedItemCount
    );
    expect(tag.content.references.length).to.equal(2);
    await this.sharedFinalAssertions();
  });

  it('succesful server side saving but dropped packet response should not create sync conflict', async function () {
    /**
     * 1. Initiate a change locally that is successfully saved by the server, but the client
     * drops the server response.
     * 2. Make a change to this note locally that then syncs and the response is successfully recorded.
     *
     * Expected result: no sync conflict is created
     */
    const note = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;

    const baseTitle = 'base title';
    /** Change the note */
    const noteAfterChange = await this.application.itemManager.changeItem(
      note.uuid,
      (mutator) => {
        mutator.title = baseTitle;
      }
    );
    await this.application.sync();

    /** Simulate a dropped response by reverting the note back its post-change, pre-sync state */
    const retroNote = await this.application.itemManager.emitItemFromPayload(
      noteAfterChange.payload
    );
    expect(retroNote.serverUpdatedAt.getTime()).to.equal(
      noteAfterChange.serverUpdatedAt.getTime()
    );

    /** Change the item to its final title and sync */
    const finalTitle = 'final title';
    await this.application.itemManager.changeItem(note.uuid, (mutator) => {
      mutator.title = finalTitle;
    });
    await this.application.sync();

    /** Expect that no duplicates have been created, and that the note's title is now finalTitle */
    expect(this.application.itemManager.notes.length).to.equal(1);
    const finalNote = this.application.findItem(note.uuid);
    expect(finalNote.title).to.equal(finalTitle);
    await this.sharedFinalAssertions();
  });

  it('receiving a decrypted item while the current local item is errored and dirty should overwrite local value', async function () {
    /**
     * An item can be marked as dirty (perhaps via a bulk dirtying operation) even if it is errored,
     * but it can never be sent to the server if errored. If we retrieve an item from the server
     * that we're able to decrypt, and the current base value is errored and dirty, we don't want to
     * create a conflict, but instead just have the server value replace the client value.
     */
    /**
     * Create a note and sync it with the server while its valid
     */
    const note = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;

    /**
     * Mark the item as dirty and errored
     */
    const errorred = CreateMaxPayloadFromAnyObject(note.payload, {
      errorDecrypting: true,
      dirty: true,
    });
    await this.application.itemManager.emitItemsFromPayloads(
      [errorred],
      PayloadSource.LocalChanged
    );

    /**
     * Retrieve this note from the server by clearing sync token
     */
    await this.application.syncService.clearSyncPositionTokens();
    await this.application.syncService.sync({
      ...syncOptions,
      awaitAll: true,
    });

    /**
     * Expect that the final result is just 1 note that is not errored
     */
    const resultNote = await this.application.findItem(note.uuid);
    expect(resultNote.errorDecrypting).to.not.be.ok;
    expect(this.application.itemManager.notes.length).to.equal(1);
    await this.sharedFinalAssertions();
  });

  it(
    'registering for account with bulk offline data belonging to another account should be error-free',
    async function () {
      /**
       * When performing a multi-page sync request where we are uploading data imported from a backup,
       * if the first page of the sync request returns conflicted items keys, we rotate their UUID.
       * The second page of sync waiting to be sent up is still encrypted with the old items key UUID.
       * This causes a problem because when that second page is returned as conflicts, we will be looking
       * for an items_key_id that no longer exists (has been rotated). Rather than modifying the entire
       * sync paradigm to allow multi-page requests to consider side-effects of each page, we will instead
       * take the approach of making sure the decryption function is liberal with regards to searching
       * for the right items key. It will now consider (as a result of this test) an items key as being
       * the correct key to decrypt an item if the itemskey.uuid == item.items_key_id OR if the itemsKey.duplicateOf
       * value is equal to item.items_key_id.
       */

      /** Create bulk data belonging to another account and sync */
      const largeItemCount = this.application.syncService.upDownLimit + 10;
      await Factory.createManyMappedNotes(this.application, largeItemCount);
      await this.application.syncService.sync(syncOptions);
      const priorData = this.application.itemManager.items;

      /** Register new account and import this same data */
      const newApp = await Factory.signOutApplicationAndReturnNew(
        this.application
      );
      await Factory.registerUserToApplication({
        application: newApp,
        email: await Factory.generateUuid(),
        password: await Factory.generateUuid(),
      });
      await newApp.itemManager.emitItemsFromPayloads(
        priorData.map((i) => i.payload)
      );
      await newApp.syncService.markAllItemsAsNeedingSync();
      await newApp.syncService.sync(syncOptions);
      expect(newApp.itemManager.invalidItems.length).to.equal(0);
      newApp.deinit();
    }
  ).timeout(60000);

  it('server should prioritize updated_at_timestamp over updated_at for sync, if provided', async function () {
    /**
     * As part of SSRB to SSJS migration, server should prefer to use updated_at_timestamp
     * over updated_at for sync conflict logic. The timestamps are more accurate and support
     * microsecond precision, versus date objects which only go up to milliseconds.
     */
    const note = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;

    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(note.uuid, (mutator) => {
      mutator.title = `${Math.random()}`;
    });
    /**
     * Create a modified payload that has updated_at set to old value, but updated_at_timestamp
     * set to new value. Then send to server. If the server conflicts, it means it's incorrectly ignoring
     * updated_at_timestamp and looking at updated_at.
     */
    const modified = CopyPayload(note.payload, {
      updated_at: new Date(0),
      content: {
        ...note.content,
        title: Math.random(),
      },
      dirty: true,
    });
    await this.application.itemManager.emitItemFromPayload(modified);
    await this.application.sync();
    expect(this.application.itemManager.notes.length).to.equal(1);
    await this.sharedFinalAssertions();
  });

  it('conflict should be created if updated_at_timestamp is not exactly equal to servers', async function () {
    const note = await Factory.createSyncedNote(this.application);
    this.expectedItemCount++;

    /** First modify the item without saving so that
     * our local contents digress from the server's */
    await this.application.changeItem(note.uuid, (mutator) => {
      mutator.title = `${Math.random()}`;
    });
    const modified = CopyPayload(note.payload, {
      updated_at_timestamp: note.payload.updated_at_timestamp - 1,
      content: {
        ...note.content,
        title: Math.random(),
      },
      dirty: true,
    });
    this.expectedItemCount++;
    await this.application.itemManager.emitItemFromPayload(modified);
    await this.application.sync();
    expect(this.application.itemManager.notes.length).to.equal(2);
    await this.sharedFinalAssertions();
  });
});
