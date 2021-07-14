import { CreateMaxPayloadFromAnyObject, ImmutablePayloadCollection, PayloadSource, CopyPayload } from '@Lib/index';
import { ContentType } from '@Lib/models';
import { PayloadManager } from '@Lib/services';
import { Uuid } from '@Lib/uuid';
import * as Factory from '../factory';
import SNCrypto from '../setup/snjs/snCrypto';

describe('payload manager', () => {
  let payloadManager;

  const createNotePayload = async () => {
    return CreateMaxPayloadFromAnyObject({
      uuid: Factory.generateUuidish(),
      content_type: ContentType.Note,
      content: {
        title: 'hello',
        text: 'world',
      },
    });
  };

  beforeAll(async function () {
    const crypto = new SNCrypto();
    Uuid.SetGenerators(crypto.generateUUIDSync, crypto.generateUUID);
  });

  beforeEach(function () {
    payloadManager = new PayloadManager();
  });

  it('emit payload should create local record', async function () {
    const payload = await createNotePayload();
    await payloadManager.emitPayload(payload);

    expect(payloadManager.collection.find(payload.uuid)).toBeTruthy();
  });

  it('emit collection', async function () {
    const payload = await createNotePayload();
    const collection = ImmutablePayloadCollection.WithPayloads(
      [payload],
      PayloadSource.RemoteRetrieved
    );
    await payloadManager.emitCollection(collection);

    expect(payloadManager.collection.find(payload.uuid)).toBeTruthy();
  });

  it('merge payloads onto master', async function () {
    const payload = await createNotePayload();
    await payloadManager.emitPayload(payload);

    const newTitle = `${Math.random()}`;
    const changedPayload = CopyPayload(payload, {
      content: {
        ...payload.safeContent,
        title: newTitle,
      },
    });
    const {
      changed,
      inserted,
    } = await payloadManager.mergePayloadsOntoMaster([changedPayload]);
    expect(changed.length).toBe(1);
    expect(inserted.length).toBe(0);
    expect(
      payloadManager.collection.find(payload.uuid).content.title
    ).toBe(newTitle);
  });

  it('insertion observer', async function () {
    const observations = [];
    payloadManager.addObserver(ContentType.Any, (_, inserted) => {
      observations.push({ inserted });
    });
    const payload = await createNotePayload();
    await payloadManager.emitPayload(payload);

    expect(observations.length).toBe(1);
    expect(observations[0].inserted[0]).toBe(payload);
  });

  it('change observer', async function () {
    const observations = [];
    payloadManager.addObserver(ContentType.Any, (changed) => {
      if (changed.length > 0) {
        observations.push({ changed });
      }
    });
    const payload = await createNotePayload();
    await payloadManager.emitPayload(payload);
    await payloadManager.emitPayload(
      CopyPayload(payload, {
        content: {
          ...payload.safeContent,
          title: 'new title',
        },
      })
    );

    expect(observations.length).toBe(1);
    expect(observations[0].changed[0].uuid).toBe(payload.uuid);
  });

  it('reset state', async function () {
    payloadManager.addObserver(ContentType.Any, (payloads) => {});
    const payload = await createNotePayload();
    await payloadManager.emitPayload(payload);
    await payloadManager.resetState();

    expect(payloadManager.collection.all().length).toBe(0);
    expect(payloadManager.changeObservers.length).toBe(1);
  });
});
