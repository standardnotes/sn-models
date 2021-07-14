import {
  Platform,
  Environment,
  DeinitSource,
  ContentType,
  ComponentAction
} from '@Lib/index';
import {
  createComponentItem,
  testExtensionEditorPackage,
  testThemeDefaultPackage,
  createNoteItem,
  createTagItem,
  registerComponentHandler,
  SHORT_DELAY_TIME,
  sleep
} from '../../helpers';
import { createAndInitializeApplication } from './../../factory';

// To prevent conflicts with Mocha
import {
  describe,
  expect,
  test,
  it,
  beforeEach,
  afterEach
} from '@jest/globals';

describe('Component Manager', () => {
  /** The global Standard Notes application. */
  let testSNApp;
  /** The global test component. */
  let testComponent;

  beforeEach(async () => {
    testSNApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);
    /**
     * Lock syncing so that there aren't any sync requests that may affect new application instances.
     */
    //@ts-ignore
    testSNApp.syncService.lockSyncing();

    testComponent = await createComponentItem(testSNApp, testExtensionEditorPackage);
  });

  afterEach(() => {
    testSNApp.deinit(DeinitSource.SignOut);
  });

  describe('sendItemsInReply()', () => {
    test('should reply to message', async () => {
      const replyToMessage = jest.spyOn(
        testSNApp.componentManager,
        'replyToMessage'
      );
      const noteItem = await createNoteItem(testSNApp, {
        title: 'Note 1',
        text: 'This is a test note :D'
      });
      const noteJsonItem = testSNApp.componentManager.jsonForItem(noteItem, testComponent);
      const message = {
        action: ComponentAction.StreamItems,
        sessionKey: 'a-session-key',
        data: {
          foo: 'bar'
        }
      };

      testSNApp.componentManager.sendItemsInReply(
        testComponent.uuid,
        [noteItem],
        message
      );
      expect(replyToMessage).toBeCalledTimes(1);
      expect(replyToMessage).toBeCalledWith(
        testComponent,
        message,
        {
          items: [noteJsonItem]
        }
      );
    });
  });

  describe('sendContextItemInReply()', () => {
    test('should reply to message', async () => {
      const replyToMessage = jest.spyOn(
        testSNApp.componentManager,
        'replyToMessage'
      );
      const noteItem = await createNoteItem(testSNApp, {
        title: 'Note 1',
        text: 'This is a test note :)'
      });
      const noteJsonItem = testSNApp.componentManager.jsonForItem(noteItem, testComponent);
      const message = {
        action: ComponentAction.StreamContextItem,
        sessionKey: 'a-session-key',
        data: {
          foo: 'bar'
        }
      };

      testSNApp.componentManager.sendContextItemInReply(
        testComponent.uuid,
        noteItem,
        message
      );
      expect(replyToMessage).toBeCalledTimes(1);
      expect(replyToMessage).toBeCalledWith(
        testComponent,
        message,
        {
          item: noteJsonItem
        }
      );
    });
  });

  describe('replyToMessage()', () => {
    it('should send message to component', () => {
      const sendMessageToComponent = jest.spyOn(
        testSNApp.componentManager,
        'sendMessageToComponent'
      );
      const originalMessage = {
        action: ComponentAction.StreamContextItem,
        sessionKey: 'a-session-key',
      };
      const replyData = {
        items: []
      };

      testSNApp.componentManager.replyToMessage(
        testComponent,
        originalMessage,
        replyData
      );
      expect(sendMessageToComponent).toBeCalledTimes(1);
      expect(sendMessageToComponent).toBeCalledWith(
        testComponent,
        {
          action: ComponentAction.Reply,
          original: originalMessage,
          data: replyData
        }
      );
    });
  });

  describe('sendMessageToComponent()', () => {
    let iframeWindow;
    let logSpy;

    beforeEach(async () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      iframeWindow = iframe.contentWindow;

      logSpy = jest.spyOn(
        testSNApp.componentManager,
        'log'
      );

      await testSNApp.componentManager.registerComponentWindow(
        testComponent,
        iframeWindow
      );
    });

    test('return if component is hidden and action is not allowed while hidden', async () => {
      const componentMessage = {
        action: ComponentAction.Reply
      };

      const postMessage = jest.spyOn(
        iframeWindow,
        'postMessage'
      );

      testSNApp.componentManager.setComponentHidden(testComponent, true);
      testSNApp.componentManager.sendMessageToComponent(
        testComponent,
        componentMessage
      );

      expect(postMessage).toBeCalledTimes(0);
      expect(logSpy).toBeCalledWith(
        'Component disabled for current item, ignoring messages.',
        testComponent.name
      );
    });

    test('return if component does not have a window and the message is a reply', async () => {
      await testSNApp.componentManager.registerComponentWindow(
        testComponent,
        undefined
      );

      const componentMessage = {
        action: ComponentAction.Reply
      };

      const postMessage = jest.spyOn(
        iframeWindow,
        'postMessage'
      );

      testSNApp.componentManager.sendMessageToComponent(
        testComponent,
        componentMessage
      );

      expect(postMessage).toBeCalledTimes(0);
      expect(logSpy).toBeCalledWith(
        'Component has been deallocated in between message send and reply',
        testComponent,
        componentMessage
      );
    });

    test('show an alert if origin is not defined', async () => {
      await testSNApp.componentManager.registerComponentWindow(
        testComponent,
        undefined
      );

      const componentMessage = {
        action: ComponentAction.ActivateThemes
      };

      const alertSpy = jest.spyOn(
        testSNApp.componentManager.alertService,
        'alert'
      );

      const postMessage = jest.spyOn(
        iframeWindow,
        'postMessage'
      );

      testSNApp.componentManager.sendMessageToComponent(
        testComponent,
        componentMessage
      );

      expect(postMessage).toBeCalledTimes(0);
      expect(alertSpy).toBeCalledTimes(1);
      expect(alertSpy).toBeCalledWith(
        `Standard Notes is trying to communicate with ${testComponent.name}, ` +
        'but an error is occurring. Please restart this extension and try again.'
      );
    });

    test('post message as-is on web or desktop', async () => {
      const componentMessage = {
        action: ComponentAction.ComponentRegistered
      };

      const postMessage = jest.spyOn(
        iframeWindow,
        'postMessage'
      );

      testSNApp.componentManager.sendMessageToComponent(
        testComponent,
        componentMessage
      );

      expect(postMessage).toBeCalledTimes(1);
      expect(postMessage).toBeCalledWith(
        componentMessage,
        testSNApp.componentManager.urlForComponent(testComponent)
      );
    });

    test('post message as json on mobile', async () => {
      testSNApp = await createAndInitializeApplication('test-application', Environment.Mobile, Platform.Android);
      await testSNApp.componentManager.registerComponentWindow(
        testComponent,
        iframeWindow
      );

      const componentMessage = {
        action: ComponentAction.ComponentRegistered
      };

      const postMessage = jest.spyOn(
        iframeWindow,
        'postMessage'
      );

      testSNApp.componentManager.sendMessageToComponent(
        testComponent,
        componentMessage
      );

      expect(postMessage).toBeCalledTimes(1);
      expect(postMessage).toBeCalledWith(
        JSON.stringify(componentMessage),
        testSNApp.componentManager.urlForComponent(testComponent)
      );
    });
  });

  describe('handleMessage()', () => {
    let alertSpy;

    beforeEach(() => {
      alertSpy = jest.spyOn(testSNApp.componentManager.alertService, 'alert');
    });

    it('shows an alert if the passed component is not valid', () => {
      const componentMessage = {
        action: ComponentAction.StreamItems
      };

      testSNApp.componentManager.handleMessage(undefined, componentMessage);
      expect(alertSpy).toBeCalledTimes(1);
      expect(alertSpy).lastCalledWith(
        'An extension is trying to communicate with Standard Notes, ' +
        'but there is an error establishing a bridge. Please restart the app and try again.'
      );
    });

    const readwriteActions = [
      ComponentAction.SaveItems,
      ComponentAction.AssociateItem,
      ComponentAction.DeassociateItem,
      ComponentAction.CreateItem,
      ComponentAction.CreateItems,
      ComponentAction.DeleteItems,
      ComponentAction.SetComponentData,
    ];

    test.each(readwriteActions)(
      'shows an alert if the component is in read-only state and the message action is %s',
      (messageAction) => {
        const componentMessage = {
          action: messageAction
        };
        testSNApp.componentManager.setReadonlyStateForComponent(testComponent, true);

        testSNApp.componentManager.handleMessage(testComponent, componentMessage);
        expect(alertSpy).toBeCalledTimes(1);
        expect(alertSpy).lastCalledWith(
          `The extension ${testComponent.name} is trying to save, but it is in a locked state and cannot accept changes.`
        );
      });

    it('calls the handler function for StreamItems action', () => {
      const componentMessage = {
        action: ComponentAction.StreamItems,
        data: {
          content_types: [ContentType.Note]
        }
      };
      const handleStreamItemsMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleStreamItemsMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleStreamItemsMessage).toBeCalledTimes(1);
      expect(handleStreamItemsMessage).lastCalledWith(testComponent, componentMessage);
    });

    it('calls the handler function for StreamContextItem action', () => {
      const componentMessage = {
        action: ComponentAction.StreamContextItem
      };
      const handleStreamContextItemMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleStreamContextItemMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleStreamContextItemMessage).toBeCalledTimes(1);
      expect(handleStreamContextItemMessage).lastCalledWith(testComponent, componentMessage);
    });

    it('calls the handler function for SetComponentData action', () => {
      const componentMessage = {
        action: ComponentAction.SetComponentData,
        data: {}
      };
      const handleSetComponentDataMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleSetComponentDataMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleSetComponentDataMessage).toBeCalledTimes(1);
      expect(handleSetComponentDataMessage).lastCalledWith(testComponent, componentMessage);
    });

    it('calls the handler function for DeleteItems action', () => {
      const componentMessage = {
        action: ComponentAction.DeleteItems,
        data: {
          items: []
        }
      };
      const handleDeleteItemsMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleDeleteItemsMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleDeleteItemsMessage).toBeCalledTimes(1);
      expect(handleDeleteItemsMessage).lastCalledWith(testComponent, componentMessage);
    });

    it('calls the handler function for CreateItem action', () => {
      const componentMessage = {
        action: ComponentAction.CreateItem,
        data: {
          item: {}
        }
      };
      const handleCreateItemsMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleCreateItemsMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleCreateItemsMessage).toBeCalledTimes(1);
      expect(handleCreateItemsMessage).lastCalledWith(testComponent, componentMessage);
    });

    it('calls the handler function for CreateItems action', () => {
      const componentMessage = {
        action: ComponentAction.CreateItems,
        data: {
          items: []
        }
      };
      const handleCreateItemsMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleCreateItemsMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleCreateItemsMessage).toBeCalledTimes(1);
      expect(handleCreateItemsMessage).lastCalledWith(testComponent, componentMessage);
    });

    it('calls the handler function for SaveItems action', async () => {
      const noteItem = await createNoteItem(testSNApp, {
        title: 'Note 1',
        text: 'This is a test note :7'
      });
      const componentMessage = {
        action: ComponentAction.SaveItems,
        data: {
          items: [noteItem]
        }
      };
      const handleSaveItemsMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleSaveItemsMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleSaveItemsMessage).toBeCalledTimes(1);
      expect(handleSaveItemsMessage).lastCalledWith(testComponent, componentMessage);
    });

    it('calls the handler function for ToggleActivateComponent action', async () => {
      const componentMessage = {
        action: ComponentAction.ToggleActivateComponent,
        data: {
          uuid: testComponent.uuid
        }
      };
      const handleToggleComponentMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleToggleComponentMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleToggleComponentMessage).toBeCalledTimes(1);
      expect(handleToggleComponentMessage).lastCalledWith(testComponent);
    });

    it('calls the handler function for RequestPermissions action', () => {
      const componentMessage = {
        action: ComponentAction.RequestPermissions,
        data: {
          permissions: []
        }
      };
      const handleRequestPermissionsMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleRequestPermissionsMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleRequestPermissionsMessage).toBeCalledTimes(1);
      expect(handleRequestPermissionsMessage).lastCalledWith(testComponent, componentMessage);
    });

    it('calls the handler function for InstallLocalComponent action', () => {
      const componentMessage = {
        action: ComponentAction.InstallLocalComponent
      };
      const handleInstallLocalComponentMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleInstallLocalComponentMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleInstallLocalComponentMessage).toBeCalledTimes(1);
      expect(handleInstallLocalComponentMessage).lastCalledWith(testComponent, componentMessage);
    });

    it('calls the handler function for DuplicateItem action', async () => {
      const noteItem = await createNoteItem(testSNApp, {
        title: 'Note 1',
        text: 'This is a test note that needs to be duplicated.'
      });
      const componentMessage = {
        action: ComponentAction.DuplicateItem,
        data: {
          item: {
            uuid: noteItem.uuid
          }
        }
      };
      const handleDuplicateItemMessage = jest.spyOn(
        testSNApp.componentManager,
        'handleDuplicateItemMessage'
      );

      testSNApp.componentManager.handleMessage(testComponent, componentMessage);
      expect(handleDuplicateItemMessage).toBeCalledTimes(1);
      expect(handleDuplicateItemMessage).lastCalledWith(testComponent, componentMessage);
    });

    it('calls the handler function for the handlers in the same area', async () => {
      const customActionHandler = jest.fn();
      const editorComponent = await createComponentItem(testSNApp, testExtensionEditorPackage);
      registerComponentHandler(
        testSNApp,
        [editorComponent.area],
        undefined,
        customActionHandler
      );

      const componentMessage = {
        action: ComponentAction.StreamItems,
        data: {
          content_types: [ContentType.Note]
        }
      };

      testSNApp.componentManager.handleMessage(editorComponent, componentMessage);
      await sleep(SHORT_DELAY_TIME);

      expect(customActionHandler).toBeCalledTimes(1);
      expect(customActionHandler).lastCalledWith(
        editorComponent,
        componentMessage.action,
        componentMessage.data
      );
    });
  });

  describe('handleStreamItemsMessage()', () => {
    let runWithPermissions;
    let sendItemsInReply;

    beforeEach(() => {
      runWithPermissions = jest.spyOn(
        testSNApp.componentManager,
        'runWithPermissions'
      );
      sendItemsInReply = jest.spyOn(
        testSNApp.componentManager,
        'sendItemsInReply'
      );

      /**
       * Components prompts for permissions via the presentPermissionsDialog function, which
       * has been implemented to use window.confirm to approve these requests.
       */
       window.confirm = (message) => true;
    });

    const AllowedContentTypesInBulk = [
      ContentType.ActionsExtension,
      ContentType.Editor,
      ContentType.ExtensionRepo,
      ContentType.FilesafeCredentials,
      ContentType.FilesafeFileMetadata,
      ContentType.FilesafeIntegration,
      ContentType.Mfa,
      ContentType.ServerExtension,
      ContentType.SmartTag,
      ContentType.Tag,
      ContentType.Theme,
    ];

    test('only allow content types that can be streamed in bulk by the component', async () => {
      const componentMessage = {
        action: ComponentAction.StreamItems,
        data: {
          content_types: AllowedContentTypesInBulk
        }
      };

      testSNApp.componentManager.handleStreamItemsMessage(testComponent, componentMessage);
      await sleep(SHORT_DELAY_TIME);

      expect(runWithPermissions).toBeCalledTimes(1);
      expect(runWithPermissions).lastCalledWith(
        testComponent.uuid,
        [
          {
            name: ComponentAction.StreamItems,
            content_types: AllowedContentTypesInBulk.sort()
          },
        ],
        expect.any(Function)
      );

      expect(sendItemsInReply).toBeCalledTimes(1);
      expect(sendItemsInReply).lastCalledWith(
        testComponent.uuid,
        expect.any(Array),
        componentMessage
      );
    });

    it('do not allow a content type to be streamed in bulk by if not in the allow list', async () => {
      await createNoteItem(testSNApp);
      await createNoteItem(testSNApp);
      await createNoteItem(testSNApp);

      const componentMessage = {
        action: ComponentAction.StreamItems,
        data: {
          content_types: [ContentType.Note]
        }
      };

      testSNApp.componentManager.handleStreamItemsMessage(testComponent, componentMessage);
      await sleep(SHORT_DELAY_TIME);

      expect(runWithPermissions).toBeCalledTimes(1);
      expect(runWithPermissions).lastCalledWith(
        testComponent.uuid,
        [
          {
            name: ComponentAction.StreamItems,
            content_types: []
          },
        ],
        expect.any(Function)
      );

      expect(sendItemsInReply).toBeCalledTimes(1);
      expect(sendItemsInReply).lastCalledWith(
        testComponent.uuid,
        [],
        componentMessage
      );
    });

    test('stream all items with the selected content types', async () => {
      const tag1 = await createTagItem(testSNApp, 'Tag 1');
      const tag2 = await createTagItem(testSNApp, 'Tag 2');
      const tag3 = await createTagItem(testSNApp, 'Tag 3');

      const componentMessage = {
        action: ComponentAction.StreamItems,
        data: {
          content_types: [ContentType.Tag]
        }
      };

      testSNApp.componentManager.handleStreamItemsMessage(testComponent, componentMessage);
      await sleep(SHORT_DELAY_TIME);

      expect(runWithPermissions).toBeCalledTimes(1);
      expect(runWithPermissions).lastCalledWith(
        testComponent.uuid,
        [
          {
            name: ComponentAction.StreamItems,
            content_types: componentMessage.data.content_types
          },
        ],
        expect.any(Function)
      );

      expect(sendItemsInReply).toBeCalledTimes(1);
      expect(sendItemsInReply).lastCalledWith(
        testComponent.uuid,
        [ tag1, tag2, tag3 ],
        componentMessage
      );
    });

    test('streamed items should be non errored items', async () => {
      await createTagItem(testSNApp, 'Tag 1');

      const componentMessage = {
        action: ComponentAction.StreamItems,
        data: {
          content_types: [ContentType.Tag]
        }
      };

      const nonErroredItemsForContentType = jest.spyOn(
        testSNApp.itemManager,
        'nonErroredItemsForContentType'
      );

      testSNApp.componentManager.handleStreamItemsMessage(testComponent, componentMessage);
      await sleep(SHORT_DELAY_TIME);

      expect(nonErroredItemsForContentType).toBeCalledTimes(1);
      expect(nonErroredItemsForContentType).lastCalledWith(ContentType.Tag);
    });
  });

  describe('handleStreamContextItemMessage()', () => {
    let runWithPermissions;
    let sendContextItemInReply;

    beforeEach(() => {
      runWithPermissions = jest.spyOn(
        testSNApp.componentManager,
        'runWithPermissions'
      );
      sendContextItemInReply = jest.spyOn(
        testSNApp.componentManager,
        'sendContextItemInReply'
      );

      /**
       * Components prompts for permissions via the presentPermissionsDialog function, which
       * has been implemented to use window.confirm to approve these requests.
       */
       window.confirm = (message) => true;
    });

    test('push to context stream observers if the observer does not exist', async () => {
      const contextStreamObservers = testSNApp.componentManager['contextStreamObservers'];

      expect(contextStreamObservers).toHaveLength(0);

      testSNApp.componentManager.handleStreamContextItemMessage(testComponent, {
        action: ComponentAction.StreamContextItem
      });
      await sleep(SHORT_DELAY_TIME);

      expect(runWithPermissions).toBeCalledTimes(1);
      expect(runWithPermissions).toBeCalledWith(
        testComponent.uuid,
        [
          {
            name: ComponentAction.StreamContextItem
          },
        ],
        expect.any(Function)
      );

      expect(contextStreamObservers).toContainEqual({
        identifier: testComponent.uuid,
        componentUuid: testComponent.uuid,
        area: testComponent.area,
        originalMessage: {
          action: ComponentAction.StreamContextItem
        },
      });
    });

    test('send context item in reply', async () => {
      const itemInContext = await createNoteItem(testSNApp, { title: 'Note 1' });
      const customActionHandler = jest.fn();
      registerComponentHandler(
        testSNApp,
        [testComponent.area],
        itemInContext,
        customActionHandler
      );

      const componentMessage = {
        action: ComponentAction.StreamContextItem
      };
      testSNApp.componentManager.handleStreamContextItemMessage(testComponent, componentMessage);
      await sleep(SHORT_DELAY_TIME);

      expect(sendContextItemInReply).toBeCalledTimes(1);
      expect(sendContextItemInReply).toBeCalledWith(
        testComponent.uuid,
        itemInContext,
        componentMessage
      );
    });
  });

  describe.skip('handleSaveItemsMessage()', () => { });

  describe('handleDuplicateItemMessage()', () => {
    let runWithPermissions;
    let replyToMessage;

    beforeEach(() => {
      runWithPermissions = jest.spyOn(
        testSNApp.componentManager,
        'runWithPermissions'
      );
      replyToMessage = jest.spyOn(
        testSNApp.componentManager,
        'replyToMessage'
      );

      /**
       * Components prompts for permissions via the presentPermissionsDialog function, which
       * has been implemented to use window.confirm to approve these requests.
       */
       window.confirm = (message) => true;
    });

    test('duplicates an item by uuid', async () => {
      const someNote = await createNoteItem(testSNApp, { title: 'Some note that will be duplicated' });
      expect(testSNApp.itemManager.noteCount).toBe(1);

      const componentMessage = {
        data: {
          item: {
            uuid: someNote.uuid
          },
        },
      };

      testSNApp.componentManager.handleDuplicateItemMessage(testComponent, componentMessage);
      await sleep(SHORT_DELAY_TIME);

      expect(runWithPermissions).toBeCalledTimes(1);
      expect(runWithPermissions).toBeCalledWith(
        testComponent.uuid,
        [
          {
            name: ComponentAction.StreamItems,
            content_types: [someNote.content_type]
          }
        ],
        expect.any(Function)
      );
      expect(testSNApp.itemManager.noteCount).toBe(2);
      expect(replyToMessage).toBeCalledTimes(1);
      expect(replyToMessage).toBeCalledWith(
        testComponent,
        componentMessage,
        {
          item: expect.objectContaining({
            content: expect.objectContaining({
              title: someNote.title,
              text: someNote.text
            })
          })
        }
      );
    });
  });

  describe.skip('handleCreateItemsMessage()', () => { });

  describe.skip('handleDeleteItemsMessage()', () => { });

  describe('handleRequestPermissionsMessage()', () => {
    let runWithPermissions;
    let replyToMessage;

    beforeEach(() => {
      runWithPermissions = jest.spyOn(
        testSNApp.componentManager,
        'runWithPermissions'
      );
      replyToMessage = jest.spyOn(
        testSNApp.componentManager,
        'replyToMessage'
      );

      /**
       * Components prompts for permissions via the presentPermissionsDialog function, which
       * has been implemented to use window.confirm to approve these requests.
       */
       window.confirm = (message) => true;
    });

    test('approves the given permissions', async () => {
      const componentMessage = {
        data: {
          permissions: [ ComponentAction.StreamItems ]
        }
      };

      testSNApp.componentManager.handleRequestPermissionsMessage(testComponent, componentMessage);
      await sleep(SHORT_DELAY_TIME);

      expect(runWithPermissions).toBeCalledTimes(1);
      expect(runWithPermissions).toBeCalledWith(
        testComponent.uuid,
        componentMessage.data.permissions,
        expect.any(Function)
      );
      expect(replyToMessage).toBeCalledTimes(1);
      expect(replyToMessage).toBeCalledWith(
        testComponent,
        componentMessage,
        {
          approved: true
        }
      );
    });
  });

  describe('handleSetComponentDataMessage()', () => {
    let runWithPermissions;

    beforeEach(() => {
      runWithPermissions = jest.spyOn(
        testSNApp.componentManager,
        'runWithPermissions'
      );

      /**
       * Components prompts for permissions via the presentPermissionsDialog function, which
       * has been implemented to use window.confirm to approve these requests.
       */
       window.confirm = (message) => true;
    });

    test('changes the componentData for the component', async () => {
      const componentMessage = {
        data: {
          componentData: {
            foo: 'test',
            bar: 'test'
          }
        }
      };

      testSNApp.componentManager.handleSetComponentDataMessage(testComponent, componentMessage);
      await sleep(SHORT_DELAY_TIME);

      expect(runWithPermissions).toBeCalledTimes(1);
      expect(runWithPermissions).toBeCalledWith(
        testComponent.uuid,
        [],
        expect.any(Function)
      );

      testComponent = testSNApp.itemManager.findItem(
        testComponent.uuid
      );
      expect(testComponent.componentData).toEqual(componentMessage.data.componentData);
    });
  });

  describe('handleToggleComponentMessage()', () => {
    test('opens a modal component', async () => {
      const modalComponent = await createComponentItem(testSNApp, {
        identifier: "test.standardnotes.my-modal-extension",
        name: "My Modal Extension",
        content_type: "SN|Component",
        area: "modal",
        version: "1.0.0",
        url: "http://localhost"
      });

      const alertMessage = jest.spyOn(window, 'alert');

      await testSNApp.componentManager.handleToggleComponentMessage(modalComponent);
      expect(alertMessage).toBeCalledTimes(1);
      expect(alertMessage).toBeCalledWith(modalComponent.name);
    });

    test('deactivate component if active', async () => {
      const activeComponent = await createComponentItem(testSNApp, testExtensionEditorPackage, {
        active: true
      });
      const deactivateComponent = jest.spyOn(
        testSNApp.componentManager,
        'deactivateComponent'
      );

      await testSNApp.componentManager.handleToggleComponentMessage(activeComponent);

      expect(deactivateComponent).toBeCalledTimes(1);
      expect(deactivateComponent).toBeCalledWith(
        activeComponent.uuid
      );
    });

    test('current active theme is activated before desactivating others', async () => {
      const currentThemeComponent = await createComponentItem(testSNApp, testThemeDefaultPackage);
      const activateComponent = jest.spyOn(
        testSNApp.componentManager,
        'activateComponent'
      );

      await testSNApp.componentManager.handleToggleComponentMessage(currentThemeComponent);

      expect(activateComponent).toBeCalledTimes(1);
      expect(activateComponent).toBeCalledWith(
        currentThemeComponent.uuid
      );
    });
  });

  describe('handleInstallLocalComponentMessage()', () => {
    let desktopManager;

    beforeEach(() => {
      const extServerHost = 'https://127.0.0.1:45653/'
      desktopManager = {
        getExtServerHost: jest.fn(() => extServerHost),
        registerUpdateObserver: jest.fn(),
        syncComponentsInstallation: jest.fn(),
        installComponent: jest.fn()
      };
      testSNApp.componentManager.setDesktopManager(desktopManager);
    });

    test('only native extensions can install local components', async () => {
      const themeComponent = await createComponentItem(testSNApp, testThemeDefaultPackage);

      testSNApp.componentManager.handleInstallLocalComponentMessage(themeComponent);
      expect(desktopManager.installComponent).toBeCalledTimes(0);
    });

    test('installComponent is called with the provided component uuid', async () => {
      const extensionsManagerPackage = {
        identifier: "test.standardnotes.extensions-manager-extension",
        name: "Extensions manager",
        content_type: "SN|Component",
        area: "modal",
        version: "1.0.0",
        url: "http://localhost/extensions/extension_manager"
      };
      const nativeExtension = await createComponentItem(testSNApp, extensionsManagerPackage);

      testSNApp.componentManager.handleInstallLocalComponentMessage(nativeExtension, {
        data: {
          uuid: testComponent.uuid
        }
      });
      expect(desktopManager.installComponent).toBeCalledTimes(1);
      expect(desktopManager.installComponent).toBeCalledWith(testComponent);
    });
  });
});
