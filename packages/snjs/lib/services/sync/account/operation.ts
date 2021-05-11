import { EncryptionIntent } from './../../../protocol/intents';
import { NonEncryptedTypes } from './response_resolver';
import { SNProtocolService } from './../../protocol_service';
import { PayloadManager } from './../../payload_manager';
import { UuidString } from './../../../types';
import { PurePayload } from '@Payloads/pure_payload';
import { arrayByDifference, subtractFromArray } from '@Lib/utils';
import { SyncResponse } from '@Services/sync/response';
import { ResponseSignalReceiver, SyncSignal } from '@Services/sync/signals';
import { SNApiService } from '../../api/api_service';

export async function payloadsByPreparingForServer(
  protocolService: SNProtocolService,
  payloads: PurePayload[]
): Promise<PurePayload[]> {
  return protocolService.payloadsByEncryptingPayloads(payloads, (payload) => {
    return NonEncryptedTypes.includes(payload.content_type!)
      ? EncryptionIntent.SyncDecrypted
      : EncryptionIntent.Sync;
  });
}

/**
 * A long running operation that handles multiple roundtrips from a server,
 * emitting a stream of values that should be acted upon in real time.
 */
export class AccountSyncOperation {
  public id = Math.random();

  private pendingUuids: UuidString[];
  private responses: SyncResponse[] = [];

  /**
   * @param payloads   An array of payloads to send to the server
   * @param receiver   A function that receives callback multiple times during the operation
   */
  constructor(
    private uuids: UuidString[],
    private receiver: ResponseSignalReceiver,
    private lastSyncToken: string,
    private paginationToken: string,
    private upDownLimit: number,
    public checkIntegrity: boolean,
    private apiService: SNApiService,
    private payloadManager: PayloadManager,
    private protocolService: SNProtocolService
  ) {
    this.pendingUuids = uuids.slice();
  }

  /**
   * Read the payloads that have been saved, or are currently in flight.
   */
  get payloadsSavedOrSaving(): PurePayload[] {
    return arrayByDifference(
      this.payloadManager.find(this.uuids),
      this.payloadManager.find(this.pendingUuids)
    );
  }

  popPayloads(count: number): PurePayload[] {
    const uuids = this.pendingUuids.slice(0, count);
    subtractFromArray(this.pendingUuids, uuids);
    return this.payloadManager.find(uuids);
  }

  async run(): Promise<void> {
    await this.receiver(SyncSignal.StatusChanged, undefined, {
      completedUploadCount: this.totalUploadCount - this.pendingUploadCount,
      totalUploadCount: this.totalUploadCount,
    });
    const payloads = await payloadsByPreparingForServer(
      this.protocolService,
      this.popPayloads(this.upLimit)
    );
    const rawResponse = await this.apiService.sync(
      payloads,
      this.lastSyncToken,
      this.paginationToken,
      this.downLimit,
      this.checkIntegrity,
      undefined,
      undefined
    );
    const response = new SyncResponse(rawResponse);

    this.responses.push(response);
    this.lastSyncToken = response.lastSyncToken!;
    this.paginationToken = response.paginationToken!;

    await this.receiver(SyncSignal.Response, response);

    if (!this.done) {
      return this.run();
    }
  }

  get done(): boolean {
    return this.pendingUuids.length === 0 && !this.paginationToken;
  }

  private get pendingUploadCount() {
    return this.pendingUuids.length;
  }

  private get totalUploadCount() {
    return this.uuids.length;
  }

  private get upLimit() {
    return this.upDownLimit;
  }

  private get downLimit() {
    return this.upDownLimit;
  }

  get numberOfItemsInvolved(): number {
    let total = 0;
    for (const response of this.responses) {
      total += response.numberOfItemsInvolved;
    }
    return total;
  }
}
