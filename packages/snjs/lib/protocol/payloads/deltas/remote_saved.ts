import { PayloadsDelta } from '@Payloads/deltas/delta';
import { PayloadSource } from '@Payloads/sources';
import { ImmutablePayloadCollection } from '@Protocol/collection/payload_collection';
import { CreateSourcedPayloadFromObject } from '@Payloads/generator';
import { filterDisallowedRemotePayloads } from '@Lib/services/sync/filter';

export class DeltaRemoteSaved extends PayloadsDelta {
  public async resultingCollection() {
    const processed = [];
    const payloads = filterDisallowedRemotePayloads(this.applyCollection.all());
    for (const payload of payloads) {
      const current = this.findBasePayload(payload.uuid!);
      /** If we save an item, but while in transit it is deleted locally, we want to keep
       * local deletion status, and not old deleted value that was sent to server. */
      const deletedState = current ? current.deleted : payload.deleted;
      const result = CreateSourcedPayloadFromObject(
        payload,
        PayloadSource.RemoteSaved,
        {
          lastSyncEnd: new Date(),
          deleted: deletedState,
          dirty: deletedState,
        }
      );
      processed.push(result);
    }
    return ImmutablePayloadCollection.WithPayloads(
      processed,
      PayloadSource.RemoteSaved
    );
  }
}
