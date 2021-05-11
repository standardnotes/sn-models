import { removeFromArray } from '@Lib/utils';
import { PayloadByMerging } from '@Lib/protocol/payloads/generator';
import { DeltaFileImport } from './../protocol/payloads/deltas/file_import';
import { PayloadSource } from './../protocol/payloads/sources';
import { ContentType } from './../models/content_types';
import { Uuids } from '@Models/functions';
import { UuidString } from './../types';
import { PurePayload } from '@Payloads/pure_payload';
import { PureService } from '@Lib/services/pure_service';
import { MutableCollection } from '@Lib/protocol/collection/collection';
import { ImmutablePayloadCollection } from '@Lib/protocol/collection/payload_collection';

type ChangeCallback = (
  changed: PurePayload[],
  inserted: PurePayload[],
  discarded: PurePayload[],
  ignored: PurePayload[],
  source?: PayloadSource,
  sourceKey?: string
) => void;

type ChangeObserver = {
  types: ContentType[];
  priority: number;
  callback: ChangeCallback;
};

type QueueElement = {
  payloads: PurePayload[];
  source: PayloadSource;
  sourceKey?: string;
  resolve: (alteredPayloads: PurePayload[]) => void;
};

/**
 * The model manager is responsible for keeping state regarding what items exist in the
 * global application state. It does so by exposing functions that allow consumers to 'map'
 * a detached payload into global application state. Whenever a change is made or retrieved
 * from any source, it must be mapped in order to be properly reflected in global application state.
 * The model manager deals only with in-memory state, and does not deal directly with storage.
 * It also serves as a query store, and can be queried for current notes, tags, etc.
 * It exposes methods that allow consumers to listen to mapping events. This is how
 * applications 'stream' items to display in the interface.
 */
export class PayloadManager extends PureService {
  private changeObservers: ChangeObserver[] = [];
  public collection: MutableCollection<PurePayload>;
  private emitQueue: QueueElement[] = [];
  /**
   * An array of content types for which we enable encrypted overwrite protection.
   * If a payload attempting to be emitted is errored, yet our current local version
   * is not errored, and the payload's content type is in this array, we do not overwrite
   * our local version. We instead notify observers of this interaction for them to handle
   * as needed
   */
  private overwriteProtection: ContentType[] = [ContentType.ItemsKey];

  constructor() {
    super();
    this.collection = new MutableCollection();
  }

  /**
   * Our payload collection keeps the latest mapped payload for every payload
   * that passes through our mapping function. Use this to query current state
   * as needed to make decisions, like about duplication or uuid alteration.
   */
  public getMasterCollection() {
    return ImmutablePayloadCollection.FromCollection(this.collection);
  }

  public deinit() {
    super.deinit();
    this.changeObservers.length = 0;
    this.resetState();
  }

  public resetState() {
    this.collection = new MutableCollection();
  }

  public find(uuids: UuidString[]): PurePayload[] {
    return this.collection.findAll(uuids) as PurePayload[];
  }

  /**
   * One of many mapping helpers available.
   * This function maps a collection of payloads.
   */
  public async emitCollection(
    collection: ImmutablePayloadCollection,
    sourceKey?: string
  ) {
    return this.emitPayloads(collection.all(), collection.source!, sourceKey);
  }

  /**
   * One of many mapping helpers available.
   * This function maps a payload to an item
   * @returns every paylod altered as a result of this operation, to be
   * saved to storage by the caller
   */
  public async emitPayload(
    payload: PurePayload,
    source: PayloadSource,
    sourceKey?: string
  ): Promise<PurePayload[]> {
    return this.emitPayloads([payload], source, sourceKey);
  }

  /**
   * This function maps multiple payloads to items, and is the authoratative mapping
   * function that all other mapping helpers rely on
   * @returns every paylod altered as a result of this operation, to be
   * saved to storage by the caller
   */
  public async emitPayloads(
    payloads: PurePayload[],
    source: PayloadSource,
    sourceKey?: string
  ): Promise<PurePayload[]> {
    if (payloads.length === 0) {
      console.warn('Attempting to emit 0 payloads.');
    }
    return new Promise((resolve) => {
      this.emitQueue.push({
        payloads,
        source,
        sourceKey,
        resolve,
      });
      if (this.emitQueue.length === 1) {
        this.popQueue();
      }
    });
  }

  private async popQueue() {
    const first = this.emitQueue[0];
    const {
      changed,
      inserted,
      discarded,
      ignored,
    } = this.mergePayloadsOntoMaster(first.payloads);
    this.notifyChangeObservers(
      changed,
      inserted,
      discarded,
      ignored,
      first.source,
      first.sourceKey
    );
    removeFromArray(this.emitQueue, first);
    first.resolve(changed.concat(inserted, discarded));
    if (this.emitQueue.length > 0) {
      this.popQueue();
    }
  }

  private mergePayloadsOntoMaster(payloads: PurePayload[]) {
    const changed: PurePayload[] = [];
    const inserted: PurePayload[] = [];
    const discarded: PurePayload[] = [];
    const ignored: PurePayload[] = [];
    for (const payload of payloads) {
      if (!payload.uuid || !payload.content_type) {
        console.error('Payload is corrupt:', payload);
        continue;
      }
      const masterPayload = this.collection.find(payload.uuid!);
      if (
        payload.errorDecrypting &&
        masterPayload &&
        !masterPayload.errorDecrypting &&
        this.overwriteProtection.includes(payload.content_type)
      ) {
        ignored.push(payload);
        continue;
      }
      const newPayload = masterPayload
        ? PayloadByMerging(masterPayload, payload)
        : payload;
      if (newPayload.discardable) {
        /** The item has been deleted and synced,
         * and can thus be removed from our local record */
        this.collection.discard(newPayload);
        discarded.push(newPayload);
      } else {
        this.collection.set(newPayload);
        if (!masterPayload) {
          inserted.push(newPayload);
        } else {
          changed.push(newPayload);
        }
      }
    }
    return { changed, inserted, discarded, ignored };
  }

  /**
   * Notifies observers when an item has been mapped.
   * @param types - An array of content types to listen for
   * @param priority - The lower the priority, the earlier the function is called
   *  wrt to other observers
   */
  public addObserver(
    types: ContentType | ContentType[],
    callback: ChangeCallback,
    priority = 1
  ) {
    if (!Array.isArray(types)) {
      types = [types];
    }
    const observer: ChangeObserver = {
      types,
      priority,
      callback,
    };
    this.changeObservers.push(observer);
    return () => {
      removeFromArray(this.changeObservers, observer);
    };
  }

  /**
   * This function is mostly for internal use, but can be used externally by consumers who
   * explicitely understand what they are doing (want to propagate model state without mapping)
   */
  public notifyChangeObservers(
    changed: PurePayload[],
    inserted: PurePayload[],
    discarded: PurePayload[],
    ignored: PurePayload[],
    source: PayloadSource,
    sourceKey?: string
  ) {
    /** Slice the observers array as sort modifies in-place */
    const observers = this.changeObservers.slice().sort((a, b) => {
      return a.priority < b.priority ? -1 : 1;
    });
    const filter = (payloads: PurePayload[], types: ContentType[]) => {
      return types.includes(ContentType.Any)
        ? payloads.slice()
        : payloads.slice().filter((payload) => {
            return types.includes(payload.content_type!);
          });
    };
    for (const observer of observers) {
      observer.callback(
        filter(changed, observer.types),
        filter(inserted, observer.types),
        filter(discarded, observer.types),
        filter(ignored, observer.types),
        source,
        sourceKey
      );
    }
  }

  /**
   * Imports an array of payloads from an external source (such as a backup file)
   * and marks the items as dirty.
   * @returns Resulting items
   */
  public async importPayloads(payloads: PurePayload[]) {
    const delta = new DeltaFileImport(
      this.getMasterCollection(),
      ImmutablePayloadCollection.WithPayloads(
        payloads,
        PayloadSource.FileImport
      ),
      undefined
    );
    const collection = await delta.resultingCollection();
    await this.emitCollection(collection);
    return Uuids(collection.payloads);
  }

  public removePayloadLocally(payload: PurePayload) {
    this.collection.discard(payload);
  }
}
