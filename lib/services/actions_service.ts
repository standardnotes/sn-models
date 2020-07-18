import { Action, ActionAccessType } from './../models/app/action';
import { ContentType } from './../models/content_types';
import { ItemManager } from '@Services/item_manager';
import { PurePayload } from '@Payloads/pure_payload';
import { SNRootKey } from '@Protocol/root_key';
import { SNActionsExtension } from './../models/app/extension';
import { SNItem } from '@Models/core/item';
import { SNSyncService } from './sync/sync_service';
import { SNProtocolService } from './protocol_service';
import { PayloadManager } from './model_manager';
import { SNHttpService, HttpResponse } from './api/http_service';
import { SNAlertService } from './alert_service';
import { PayloadSource } from '@Payloads/sources';
import { EncryptionIntent } from '@Protocol/intents';
import { PureService } from '@Lib/services/pure_service';
import { CopyPayload, CreateMaxPayloadFromAnyObject } from '@Payloads/generator';
import { DeviceInterface } from '../device_interface';

type PasswordRequestHandler = () => Promise<string>

export type ActionResponse = {
  response?: HttpResponse
  error?: { message: string }
  item?: any
}

/**
 * The Actions Service allows clients to interact with action-based extensions.
 * Action-based extensions are mostly RESTful actions that can push a local value or
 * retrieve a remote value and act on it accordingly.
 * There are 4 action types:
 * `get`: performs a GET request on an endpoint to retrieve an item value, and merges the
 *      value onto the local item value. For example, you can GET an item's older revision
 *      value and replace the current value with the revision.
 * `render`: performs a GET request, and displays the result in the UI. This action does not
 *         affect data unless action is taken explicitely in the UI after the data is presented.
 * `show`: opens the action's URL in a browser.
 * `post`: sends an item's data to a remote service. This is used for example by Listed
 *       to allow publishing a note to a user's blog.
 */
export class SNActionsService extends PureService {

  private alertService?: SNAlertService
  private httpService?: SNHttpService
  private modelManager?: PayloadManager
  private itemManager?: ItemManager
  private protocolService?: SNProtocolService
  private syncService?: SNSyncService
  private previousPasswords: string[] = []

  constructor(
    itemManager: ItemManager,
    alertService: SNAlertService,
    deviceInterface: DeviceInterface,
    httpService: SNHttpService,
    modelManager: PayloadManager,
    protocolService: SNProtocolService,
    syncService: SNSyncService,
  ) {
    super();
    this.itemManager = itemManager;
    this.alertService = alertService;
    this.deviceInterface = deviceInterface;
    this.httpService = httpService;
    this.modelManager = modelManager;
    this.protocolService = protocolService;
    this.syncService = syncService;
    this.previousPasswords = [];
  }

  /** @override */
  public deinit() {
    this.itemManager = undefined;
    this.alertService = undefined;
    this.deviceInterface = undefined;
    this.httpService = undefined;
    this.modelManager = undefined;
    this.protocolService = undefined;
    this.syncService = undefined;
    this.previousPasswords.length = 0;
    super.deinit();
  }

  public getExtensions(): SNActionsExtension[] {
    return this.itemManager!
      .nonErroredItemsForContentType(ContentType.ActionsExtension) as SNActionsExtension[];
  }

  public extensionsInContextOfItem(item: SNItem) {
    return this.getExtensions().filter((ext) => {
      return ext.supported_types.includes(item.content_type) ||
        ext.actionsWithContextForItem(item).length > 0;
    });
  }

  /**
   * Loads an extension in the context of a certain item.
   * The server then has the chance to respond with actions that are
   * relevant just to this item. The response extension is not saved,
   * just displayed as a one-time thing.
  */
  public async loadExtensionInContextOfItem(extension: SNActionsExtension, item: SNItem) {
    const params = {
      content_type: item.content_type,
      item_uuid: item.uuid
    };
    const response = await this.httpService!.getAbsolute(
      extension.url,
      params
    ).catch((response) => {
      console.error('Error loading extension', response);
      return null;
    });
    if (!response) {
      return;
    }
    const description = response.description || extension.description;
    const supported_types = response.supported_types || extension.supported_types;
    const actions = (
      response.actions
        ? response.actions.map((action: any) => {
          return new Action(action);
        })
        : []
    )
    await this.itemManager!.changeActionsExtension(
      extension.uuid,
      (mutator) => {
        mutator.description = description;
        mutator.supported_types = supported_types;
        mutator.actions = actions;
        mutator.hidden = false;
      }
    );
    return this.itemManager!.findItem(extension.uuid) as SNActionsExtension;
  }

  public async runAction(
    action: Action,
    item: SNItem,
    passwordRequestHandler: PasswordRequestHandler
  ): Promise<ActionResponse> {
    let result;
    switch (action.verb) {
      case 'get':
        result = await this.handleGetAction(action, passwordRequestHandler);
        break;
      case 'render':
        result = await this.handleRenderAction(action, passwordRequestHandler);
        break;
      case 'show':
        result = await this.handleShowAction(action);
        break;
      case 'post':
        result = await this.handlePostAction(action, item);
        break;
      default:
        break;
    }
    return result as ActionResponse;
  }

  private async handleGetAction(
    action: Action,
    passwordRequestHandler: PasswordRequestHandler
  ): Promise<ActionResponse> {
    const confirmed = await this.alertService!.confirm(
      "Are you sure you want to replace the current note contents with this action's results?"
    )
    if (confirmed) {
      return this.runConfirmedGetAction(action, passwordRequestHandler);
    } else {
      return {
        error: {
          message: 'Action canceled by user.'
        }
      }
    }
  }

  private async runConfirmedGetAction(
    action: Action,
    passwordRequestHandler: PasswordRequestHandler
  ) {
    const response = await this.httpService!.getAbsolute(action.url)
      .catch((response) => {
        const error = (response && response.error)
          || { message: 'An issue occurred while processing this action. Please try again.' };
        this.alertService!.alert(error.message);
        return { error } as HttpResponse;
      });
    if (response.error) {
      return { response } as ActionResponse;
    }
    const payload = await this.payloadByDecryptingResponse(
      response,
      passwordRequestHandler
    );
    await this.modelManager!.emitPayload(
      CopyPayload(
        payload!,
        {
          dirty: true,
          dirtiedDate: new Date()
        }
      ),
      PayloadSource.RemoteActionRetrieved,
    );
    this.syncService!.sync();
    return {
      response,
      item: response.item
    } as ActionResponse;
  }

  private async handleRenderAction(action: Action, passwordRequestHandler: PasswordRequestHandler) {
    const response = await this.httpService!.getAbsolute(action.url).then(async (response) => {
      const payload = await this.payloadByDecryptingResponse(
        response,
        passwordRequestHandler
      );
      if (payload) {
        const item = await this.itemManager!.createItem(
          payload.content_type!,
          payload.contentObject
        );
        return {
          response,
          item
        } as ActionResponse;
      }
    }).catch((response) => {
      const error = (response && response.error)
        || { message: 'An issue occurred while processing this action. Please try again.' };
      this.alertService!.alert(error.message);
      return { error } as HttpResponse;
    });

    return response as ActionResponse;
  }

  private async payloadByDecryptingResponse(
    response: HttpResponse,
    passwordRequestHandler: PasswordRequestHandler,
    key?: SNRootKey,
  ): Promise<PurePayload | undefined> {
    const payload = CreateMaxPayloadFromAnyObject(response.item);
    const decryptedPayload = await this.protocolService!.payloadByDecryptingPayload(
      payload,
      key
    );
    if (!decryptedPayload.errorDecrypting) {
      return decryptedPayload;
    }
    if (!response.auth_params) {
      /**
       * In some cases revisions were missing auth params.
       * Instruct the user to email us to get this remedied.
       */
      this.alertService!.alert(
        'We were unable to decrypt this revision using your current keys, ' +
        'and this revision is missing metadata that would allow us to try different ' +
        'keys to decrypt it. This can likely be fixed with some manual intervention. ' +
        'Please email hello@standardnotes.org for assistance.'
      );
      return undefined;
    }
    /* Try previous passwords */
    const triedPasswords: string[] = [];
    for (const passwordCandidate of this.previousPasswords) {
      if (triedPasswords.includes(passwordCandidate)) {
        continue;
      }
      triedPasswords.push(passwordCandidate);
      const key = await this.protocolService!.computeRootKey(
        passwordCandidate,
        response.auth_params
      );
      if (!key) {
        continue;
      }
      const nestedResponse: any = await this.payloadByDecryptingResponse(
        response,
        passwordRequestHandler,
        key,
      );
      if (nestedResponse) {
        return nestedResponse;
      }
    }
    /** Prompt for other passwords */
    const password = await passwordRequestHandler();
    this.previousPasswords.push(password);
    return this.payloadByDecryptingResponse(
      response,
      passwordRequestHandler,
      key,
    );
  }

  private async handlePostAction(action: Action, item: SNItem) {
    const decrypted = action.access_type === ActionAccessType.Decrypted;
    const itemParams = await this.outgoingPayloadForItem(item, decrypted);
    const params = {
      items: [itemParams]
    };
    return this.httpService!.postAbsolute(action.url, params).then((response) => {
      return { response } as ActionResponse;
    }).catch((response) => {
      console.error('Action error response:', response);
      this.alertService!.alert(
        'An issue occurred while processing this action. Please try again.'
      );
      return { response } as ActionResponse;
    });
  }

  private async handleShowAction(action: Action) {
    this.deviceInterface!.openUrl(action.url);
    return { response: undefined } as ActionResponse;
  }

  private async outgoingPayloadForItem(item: SNItem, decrypted = false) {
    const intent = decrypted
      ? EncryptionIntent.FileDecrypted
      : EncryptionIntent.FileEncrypted;
    const encrypted = await this.protocolService!.payloadByEncryptingPayload(
      item.payloadRepresentation(),
      intent
    );
    return encrypted.ejected();
  }
}
