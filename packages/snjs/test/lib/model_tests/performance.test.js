import { CreateMaxPayloadFromAnyObject, PayloadSource } from '@Lib/index';
import { ContentType } from '@Lib/models';
import { Uuid } from '@Lib/uuid';
import * as Factory from './../../factory';

describe('mapping performance', () => {
  it('shouldnt take a long time', async () => {
    jest.setTimeout(20000);

    /*
    There was an issue with mapping where we were using arrays for everything instead of hashes (like items, missedReferences),
    which caused searching to be really expensive and caused a huge slowdown.
    */
    const application = await Factory.createInitAppWithRandNamespace();

    // create a bunch of notes and tags, and make sure mapping doesn't take a long time
    const noteCount = 1500;
    const tagCount = 10;
    const tags = [];
    const notes = [];
    for (let i = 0; i < tagCount; i++) {
      var tag = {
        uuid: Uuid.GenerateUuidSynchronously(),
        content_type: ContentType.Tag,
        content: {
          title: `${Math.random()}`,
          references: [],
        },
      };
      tags.push(tag);
    }
    for (let i = 0; i < noteCount; i++) {
      const note = {
        uuid: Uuid.GenerateUuidSynchronously(),
        content_type: ContentType.Note,
        content: {
          title: `${Math.random()}`,
          text: `${Math.random()}`,
          references: [],
        },
      };
      const randomTag = Factory.randomArrayValue(tags);
      randomTag.content.references.push({
        content_type: ContentType.Note,
        uuid: note.uuid,
      });
      notes.push(note);
    }

    const payloads = Factory.shuffleArray(tags.concat(notes)).map((item) => {
      return CreateMaxPayloadFromAnyObject(item);
    });

    const t0 = performance.now();
    // process items in separate batches, so as to trigger missed references
    let currentIndex = 0;
    const batchSize = 100;
    for (let i = 0; i < payloads.length; i += batchSize) {
      const subArray = payloads.slice(currentIndex, currentIndex + batchSize);
      await application.itemManager.emitItemsFromPayloads(
        subArray,
        PayloadSource.LocalChanged
      );
      currentIndex += batchSize;
    }

    const t1 = performance.now();
    const seconds = (t1 - t0) / 1000;
    const expectedRunTime = 3; // seconds
    expect(seconds).toBeLessThanOrEqual(expectedRunTime);

    for (const note of application.itemManager.nonErroredItemsForContentType(
      ContentType.Note
    )) {
      expect(
        application.itemManager.itemsReferencingItem(note.uuid).length
      ).toBeGreaterThan(0);
    }
    await application.deinit();
  });

  it('mapping a tag with thousands of notes should be quick', async () => {
    jest.setTimeout(20000);

    /*
      There was an issue where if you have a tag with thousands of notes, it will take minutes to resolve.
      Fixed now. The issue was that we were looping around too much. I've consolidated some of the loops
      so that things require less loops in payloadManager, regarding missedReferences.
    */
    const application = await Factory.createInitAppWithRandNamespace();

    const noteCount = 10000;
    const notes = [];

    const tag = {
      uuid: Uuid.GenerateUuidSynchronously(),
      content_type: ContentType.Tag,
      content: {
        title: `${Math.random()}`,
        references: [],
      },
    };

    for (let i = 0; i < noteCount; i++) {
      const note = {
        uuid: Uuid.GenerateUuidSynchronously(),
        content_type: ContentType.Note,
        content: {
          title: `${Math.random()}`,
          text: `${Math.random()}`,
          references: [],
        },
      };

      tag.content.references.push({
        content_type: ContentType.Note,
        uuid: note.uuid,
      });
      notes.push(note);
    }

    const payloads = [tag]
      .concat(notes)
      .map((item) => CreateMaxPayloadFromAnyObject(item));

    const t0 = performance.now();
    // process items in separate batches, so as to trigger missed references
    let currentIndex = 0;
    const batchSize = 100;
    for (let i = 0; i < payloads.length; i += batchSize) {
      var subArray = payloads.slice(currentIndex, currentIndex + batchSize);
      await application.itemManager.emitItemsFromPayloads(
        subArray,
        PayloadSource.LocalChanged
      );
      currentIndex += batchSize;
    }

    const t1 = performance.now();
    const seconds = (t1 - t0) / 1000;
    /** Expected run time depends on many different factors,
     * like how many other tests you're running and overall system capacity.
     * Locally, best case should be around 3.3s and worst case should be 5s.
     * However on CI this can sometimes take up to 10s.
     */
    const MAX_RUN_TIME = 15.0; // seconds
    expect(seconds).toBeLessThanOrEqual(MAX_RUN_TIME);

    application.itemManager.nonErroredItemsForContentType(ContentType.Tag)[0];
    for (const note of application.itemManager.nonErroredItemsForContentType(
      ContentType.Note
    )) {
      expect(
        application.itemManager.itemsReferencingItem(note.uuid).length
      ).toBe(1);
    }
    await application.deinit();
  });
});
