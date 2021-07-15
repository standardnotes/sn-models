import * as Factory from '../factory';
import sinon from 'sinon';
import { KeyParamsOrigination, PurePayload } from '@Lib/index';
import { ContentType } from '@Lib/models';
import { EncryptionIntent } from '@Lib/protocol';
import { Uuid } from '@Lib/uuid';

describe('actions service', () => {
  const errorProcessingActionMessage =
    'An issue occurred while processing this action. Please try again.';
  const errorDecryptingRevisionMessage =
    'We were unable to decrypt this revision using your current keys, ' +
    'and this revision is missing metadata that would allow us to try different ' +
    'keys to decrypt it. This can likely be fixed with some manual intervention. ' +
    'Please email hello@standardnotes.org for assistance.';

  let application, itemManager, actionsManager;
  let email, password;
  let authParams;
  let fakeServer, actionsExtension, extensionItemUuid;

  beforeAll(async function () {
    // Set timeout for all tests.
    jest.setTimeout(20000);

    localStorage.clear();

    application = await Factory.createInitAppWithRandNamespace();
    itemManager = application.itemManager;
    actionsManager = application.actionsManager;
    email = Uuid.GenerateUuidSynchronously();
    password = Uuid.GenerateUuidSynchronously();

    await Factory.registerUserToApplication({
      application: application,
      email: email,
      password: password,
    });

    const rootKey = await application.protocolService.createRootKey(
      email,
      password,
      KeyParamsOrigination.Registration
    );
    authParams = rootKey.keyParams.content;

    fakeServer = sinon.fakeServer.create();
    fakeServer.respondImmediately = true;

    actionsExtension = {
      identifier: 'org.standardnotes.testing',
      name: 'Test extension',
      content_type: 'Extension',
      url: 'http://my-extension.sn.org/get_actions/',
      description: 'For testing purposes.',
      supported_types: ['Note'],
      actions: [
        {
          label: 'Action #1',
          url: 'http://my-extension.sn.org/action_1/',
          verb: 'get',
          context: '*',
          content_types: ['Note'],
        },
        {
          label: 'Action #2',
          url: 'http://my-extension.sn.org/action_2/',
          verb: 'render',
          context: 'Note',
          content_types: ['Note'],
        },
        {
          label: 'Action #3',
          url: 'http://my-extension.sn.org/action_3/',
          verb: 'show',
          context: 'Tag',
          content_types: ['Note'],
        },
        {
          label: 'Action #5',
          url: 'http://my-extension.sn.org/action_5/',
          verb: 'render',
          context: 'Note',
          content_types: ['Note'],
        },
        {
          label: 'Action #7',
          url: 'http://my-extension.sn.org/action_7/',
          verb: 'nested',
          context: 'Note',
          content_types: ['Note'],
        },
      ],
    };

    fakeServer.respondWith(
      'GET',
      /http:\/\/my-extension.sn.org\/get_actions\/(.*)/,
      (request, params) => {
        const urlParams = new URLSearchParams(params);
        const extension = actionsExtension;

        if (urlParams.has('item_uuid')) {
          extension.actions.push({
            label: 'Action #4',
            url: `http://my-extension.sn.org/action_4/?item_uuid=${urlParams.get(
              'item_uuid'
            )}`,
            verb: 'post',
            context: 'Item',
            content_types: ['Note'],
            access_type: 'decrypted',
          });

          extension.actions.push({
            label: 'Action #6',
            url: `http://my-extension.sn.org/action_6/?item_uuid=${urlParams.get(
              'item_uuid'
            )}`,
            verb: 'post',
            context: 'Item',
            content_types: ['Note'],
            access_type: 'encrypted',
          });
        }

        request.respond(
          200,
          { 'Content-Type': 'application/json' },
          JSON.stringify(extension)
        );
      }
    );

    const payload = new PurePayload({
      uuid: Factory.generateUuid(),
      content_type: ContentType.Note,
      content: {
        title: 'Testing',
      },
    });

    const encryptedPayload = await application.protocolService.payloadByEncryptingPayload(
      payload,
      EncryptionIntent.Sync
    );

    fakeServer.respondWith(
      'GET',
      /http:\/\/my-extension.sn.org\/action_[1,2]\/(.*)/,
      (request, params) => {
        request.respond(
          200,
          { 'Content-Type': 'application/json' },
          JSON.stringify({
            item: encryptedPayload,
            auth_params: authParams,
          })
        );
      }
    );

    fakeServer.respondWith('GET', 'http://my-extension.sn.org/action_3/', [
      200,
      { 'Content-Type': 'text/html; charset=utf-8' },
      '<h2>Action #3</h2>',
    ]);

    fakeServer.respondWith(
      'POST',
      /http:\/\/my-extension.sn.org\/action_[4,6]\/(.*)/,
      (request, params) => {
        const requestBody = JSON.parse(request.requestBody);

        const response = {
          uuid: requestBody.items[0].uuid,
          result: 'Action POSTed successfully.',
        };

        request.respond(
          200,
          { 'Content-Type': 'application/json' },
          JSON.stringify(response)
        );
      }
    );

    fakeServer.respondWith(
      'GET',
      'http://my-extension.sn.org/action_5/',
      (request, params) => {
        const encryptedPayloadClone = JSON.parse(
          JSON.stringify(encryptedPayload)
        );

        encryptedPayloadClone.items_key_id = undefined;
        encryptedPayloadClone.content = '003:somenonsense';
        encryptedPayloadClone.enc_item_key = '003:anothernonsense';
        encryptedPayloadClone.version = '003';
        encryptedPayloadClone.uuid = 'fake-uuid';

        request.respond(
          200,
          { 'Content-Type': 'application/json' },
          JSON.stringify({
            item: encryptedPayloadClone,
            auth_params: authParams,
          })
        );
      }
    );

    // Extension item
    const extensionItem = await application.itemManager.createItem(
      ContentType.ActionsExtension,
      actionsExtension
    );
    extensionItemUuid = extensionItem.uuid;
  });

  afterAll(function () {
    fakeServer.restore();
    application.deinit();
    application = null;
    localStorage.clear();
  });

  it('should get extension items', async function () {
    await itemManager.createItem(ContentType.Note, {
      title: 'A simple note',
      text: 'Standard Notes rocks! lml.',
    });
    const extensions = actionsManager.getExtensions();
    expect(extensions.length).toBe(1);
  });

  it('should get extensions in context of item', async function () {
    const noteItem = await itemManager.createItem(ContentType.Note, {
      title: 'Another note',
      text: 'Whiskey In The Jar',
    });

    const noteItemExtensions = actionsManager.extensionsInContextOfItem(
      noteItem
    );
    expect(noteItemExtensions.length).toBe(1);
    expect(noteItemExtensions[0].supported_types).toEqual(expect.arrayContaining([noteItem.content_type]));
  });

  it('should get actions based on item context', async function () {
    const tagItem = await itemManager.createItem(ContentType.Tag, {
      title: 'Music',
    });

    const extensionItem = await itemManager.findItem(
      extensionItemUuid
    );
    const tagActions = extensionItem.actionsWithContextForItem(tagItem);

    expect(tagActions.length).toBe(1);
    expect(tagActions.map((action) => action.label)).toEqual(expect.arrayContaining([
      'Action #3',
    ]));
  });

  it('should load extension in context of item', async function () {
    const noteItem = await itemManager.createItem(ContentType.Note, {
      title: 'Yet another note',
      text: 'And all things will end ♫',
    });

    const extensionItem = await itemManager.findItem(
      extensionItemUuid
    );

    const extensionWithItem = await actionsManager.loadExtensionInContextOfItem(
      extensionItem,
      noteItem
    );
    const updatedExtensionItem = await itemManager.findItem(
      extensionItemUuid
    );

    expect(extensionWithItem).toBe(updatedExtensionItem);
    const extensions = actionsManager.getExtensions();
    expect(extensions[0].actions.map((action) => action.label)).toEqual(expect.arrayContaining(['Action #4']));
  });

  describe('get action', function () {
    const sandbox = sinon.createSandbox();
    const confirmMessage =
      'Are you sure you want to replace the current note ' +
      "contents with this action's results?";

    let noteItem, getAction;
    let passwordRequestHandler, confirmAlertService, syncServiceSync;

    beforeAll(async function () {
      noteItem = await itemManager.createItem(ContentType.Note, {
        title: 'Know what?',
        text: 'To Live is to Die',
      });
      const extensionItem = await itemManager.findItem(
        extensionItemUuid
      );
      getAction = extensionItem.actions.filter(
        (action) => action.verb === 'get'
      )[0];
    });

    beforeEach(async function () {
      passwordRequestHandler = sandbox.spy();
      confirmAlertService = sandbox
        .stub(actionsManager.alertService, 'confirm')
        .callsFake((message) => true);
      syncServiceSync = sandbox.spy(
        actionsManager.syncService,
        'sync'
      );
    });

    afterEach(async function () {
      sandbox.restore();
    });

    it('should be canceled if requested', async function () {
      confirmAlertService.callsFake((message) => false);

      const actionResponse = await actionsManager.runAction(
        getAction,
        noteItem,
        passwordRequestHandler
      );

      sinon.assert.calledOnceWithExactly(
        confirmAlertService,
        confirmMessage
      );
      expect(actionResponse.error.message).toBe('Action canceled by user.');
      sinon.assert.notCalled(syncServiceSync);
    });

    it('should show a confirmation message', async function () {
      await actionsManager.runAction(
        getAction,
        noteItem,
        passwordRequestHandler
      );

      sinon.assert.calledOnceWithExactly(
        confirmAlertService,
        confirmMessage
      );
    });

    it('should return response and item keys', async function () {
      const actionResponse = await actionsManager.runAction(
        getAction,
        noteItem,
        passwordRequestHandler
      );

      expect(Object.keys(actionResponse)).toEqual(expect.arrayContaining([
        'item',
        'status',
        'data',
        'auth_params',
      ]));
    });

    it('should perform a sync request', async function () {
      await actionsManager.runAction(
        getAction,
        noteItem,
        passwordRequestHandler
      );

      sinon.assert.calledOnce(syncServiceSync);
    });

    it('should not change the item', async function () {
      await actionsManager.runAction(
        getAction,
        noteItem,
        passwordRequestHandler
      );
      const refreshedNoteItem = await itemManager.findItem(
        noteItem.uuid
      );

      expect(noteItem).toBe(refreshedNoteItem);
    });
  });

  describe('render action', function () {
    const sandbox = sinon.createSandbox();
    let alertServiceAlert;
    let noteItem, renderAction, windowAlert, passwordRequestHandler;

    beforeAll(async function () {
      noteItem = await itemManager.createItem(ContentType.Note, {
        title: 'Hey',
        text: 'Welcome To Paradise',
      });
      const extensionItem = await itemManager.findItem(
        extensionItemUuid
      );
      renderAction = extensionItem.actions.filter(
        (action) => action.verb === 'render'
      )[0];
    });

    beforeEach(async function () {
      alertServiceAlert = sandbox.spy(
        actionsManager.alertService,
        'alert'
      );
      windowAlert = sandbox
        .stub(window, 'alert')
        .callsFake((message) => message);
      passwordRequestHandler = sandbox
        .stub()
        .callsFake(() => password);
    });

    afterEach(async function () {
      sandbox.restore();
    });

    it('should show an alert if the request fails', async function () {
      const httpServiceGetAbsolute = sandbox
        .stub(actionsManager.httpService, 'getAbsolute')
        .callsFake((url) => Promise.reject(new Error('Dummy error.')));

      const actionResponse = await actionsManager.runAction(
        renderAction,
        noteItem,
        passwordRequestHandler
      );

      sinon.assert.calledOnceWithExactly(
        httpServiceGetAbsolute,
        renderAction.url
      );
      sinon.assert.calledOnceWithExactly(
        alertServiceAlert,
        errorProcessingActionMessage
      );
      expect(actionResponse.error.message).toBe(errorProcessingActionMessage);
    });

    it('should return a response if payload is valid', async function () {
      const actionResponse = await actionsManager.runAction(
        renderAction,
        noteItem,
        passwordRequestHandler
      );

      expect(actionResponse).toHaveProperty('item');
      expect(actionResponse.item.payload.content.title).toBe('Testing');
    });

    it('should return undefined if payload is invalid', async function () {
      sandbox
        .stub(actionsManager, 'payloadByDecryptingResponse')
        .returns(null);

      const actionResponse = await actionsManager.runAction(
        renderAction,
        noteItem,
        passwordRequestHandler
      );
      expect(actionResponse).toBeUndefined();
    });

    it('should return undefined and alert if payload could not be decrypted and auth_params are missing', async function () {
      const itemPayload = new PurePayload({
        uuid: Factory.generateUuid(),
      });

      sandbox
        .stub(actionsManager.httpService, 'getAbsolute')
        .resolves({ item: itemPayload });
      sandbox
        .stub(actionsManager.protocolService, 'payloadByDecryptingPayload')
        .returns({ errorDecrypting: true });

      const actionResponse = await actionsManager.runAction(
        renderAction,
        noteItem,
        passwordRequestHandler
      );

      sinon.assert.calledOnceWithExactly(
        alertServiceAlert,
        errorDecryptingRevisionMessage
      );
      expect(actionResponse).toBeUndefined();
    });

    it('should try previous passwords and prompt for other passwords', async function () {
      /** Using a custom action that returns a payload with an invalid items_key_id. */
      const extensionItem = await itemManager.findItem(
        extensionItemUuid
      );
      renderAction = extensionItem.actions.filter(
        (action) => action.verb === 'render'
      )[1];

      await actionsManager.runAction(
        renderAction,
        noteItem,
        passwordRequestHandler
      );

      sinon.assert.called(passwordRequestHandler);
    });

    it('should return decrypted payload if password is valid', async function () {
      const extensionItem = await itemManager.findItem(
        extensionItemUuid
      );
      renderAction = extensionItem.actions.filter(
        (action) => action.verb === 'render'
      )[0];
      const actionResponse = await actionsManager.runAction(
        renderAction,
        noteItem,
        passwordRequestHandler
      );

      expect(actionResponse.item).toBeTruthy();
      expect(actionResponse.item.title).toBe('Testing');
    });
  });

  describe('show action', function () {
    const sandbox = sinon.createSandbox();
    let showAction, deviceInterfaceOpenUrl;

    beforeAll(async function () {
      const extensionItem = await itemManager.findItem(
        extensionItemUuid
      );
      showAction = extensionItem.actions[2];
    });

    beforeEach(async function () {
      actionsManager.deviceInterface.openUrl = (url) => url;
      deviceInterfaceOpenUrl = sandbox.spy(
        actionsManager.deviceInterface,
        'openUrl'
      );
    });

    afterEach(async function () {
      sandbox.restore();
    });

    it('should open the action url', async function () {
      const response = await actionsManager.runAction(showAction);

      sandbox.assert.calledOnceWithExactly(
        deviceInterfaceOpenUrl,
        showAction.url
      );
      expect(response).toEqual({});
    });
  });

  describe('post action', function () {
    const sandbox = sinon.createSandbox();
    let noteItem, extensionItem, decryptedPostAction, encryptedPostAction;
    let alertServiceAlert, windowAlert, httpServicePostAbsolute;

    beforeAll(async function () {
      noteItem = await itemManager.createItem(ContentType.Note, {
        title: 'Excuse Me',
        text: 'Time To Be King 8)',
      });
      extensionItem = await itemManager.findItem(
        extensionItemUuid
      );
      extensionItem = await actionsManager.loadExtensionInContextOfItem(
        extensionItem,
        noteItem
      );

      decryptedPostAction = extensionItem.actions.filter(
        (action) => action.access_type === 'decrypted' && action.verb === 'post'
      )[0];

      encryptedPostAction = extensionItem.actions.filter(
        (action) => action.access_type === 'encrypted' && action.verb === 'post'
      )[0];
    });

    beforeEach(async function () {
      alertServiceAlert = sandbox.spy(
        actionsManager.alertService,
        'alert'
      );
      windowAlert = sandbox
        .stub(window, 'alert')
        .callsFake((message) => message);
      httpServicePostAbsolute = sandbox.stub(
        actionsManager.httpService,
        'postAbsolute'
      );
      httpServicePostAbsolute.callsFake((url, params) =>
        Promise.resolve(params)
      );
    });

    afterEach(async function () {
      sandbox.restore();
    });

    it('should include generic encrypted payload within request body', async function () {
      const response = await actionsManager.runAction(
        encryptedPostAction,
        noteItem
      );

      const latestProtocolVersion = application.protocolService.getLatestVersion();
      const startWithVersion = new RegExp(`^${latestProtocolVersion}`)
      expect(response.items[0].enc_item_key).toMatch(startWithVersion);
      expect(response.items[0].uuid).toBe(noteItem.uuid);
      expect(response.items[0].auth_hash).toBeFalsy();
      expect(response.items[0].content_type).toBeTruthy();
      expect(response.items[0].created_at).toBeTruthy();
      expect(response.items[0].content).toMatch(startWithVersion);
    });

    it('should include generic decrypted payload within request body', async function () {
      const response = await actionsManager.runAction(
        decryptedPostAction,
        noteItem
      );

      expect(response.items[0].uuid).toBe(noteItem.uuid);
      expect(response.items[0].enc_item_key).toBeFalsy();
      expect(response.items[0].auth_hash).toBeFalsy();
      expect(response.items[0].content_type).toBeTruthy();
      expect(response.items[0].created_at).toBeTruthy();
      expect(response.items[0].content.title).toBe(noteItem.title);
      expect(response.items[0].content.text).toBe(noteItem.text);
    });

    it('should post to the action url', async function () {
      httpServicePostAbsolute.restore();
      const response = await actionsManager.runAction(
        decryptedPostAction,
        noteItem
      );

      expect(response).toBeTruthy();
      expect(response.uuid).toBe(noteItem.uuid);
      expect(response.result).toBe('Action POSTed successfully.');
    });

    it('should alert if an error occurred while processing the action', async function () {
      httpServicePostAbsolute.restore();
      const dummyError = new Error('Dummy error.');

      sandbox
        .stub(actionsManager.httpService, 'postAbsolute')
        .callsFake((url, params) => Promise.reject(dummyError));

      const response = await actionsManager.runAction(
        decryptedPostAction,
        noteItem
      );

      sinon.assert.calledOnceWithExactly(
        alertServiceAlert,
        errorProcessingActionMessage
      );
      expect(response).toBe(dummyError);
    });
  });

  describe('nested action', function () {
    const sandbox = sinon.createSandbox();
    let nestedAction, actionsManagerRunAction, httpServiceRunHttp, actionResponse;

    beforeAll(async function () {
      const extensionItem = await itemManager.findItem(
        extensionItemUuid
      );
      nestedAction = extensionItem.actions.filter(
        (action) => action.verb === 'nested'
      )[0];
    });

    beforeEach(async function () {
      actionsManagerRunAction = sandbox.spy(
        actionsManager,
        'runAction'
      );
      httpServiceRunHttp = sandbox.spy(
        actionsManager.httpService,
        'runHttp'
      );
      actionResponse = await actionsManager.runAction(
        nestedAction
      );
    });

    afterEach(async function () {
      sandbox.restore();
    });

    it('should return undefined', async function () {
      expect(actionResponse).toBeUndefined();
    });

    it('should call runAction once', async function () {
      sandbox.assert.calledOnce(actionsManagerRunAction);
    });

    it('should not make any http requests', async function () {
      sandbox.assert.notCalled(httpServiceRunHttp);
    });
  });
});
