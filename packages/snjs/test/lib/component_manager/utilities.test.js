import {
  Platform,
  Environment,
  DeinitSource,
  ContentType,
  ComponentArea,
  ComponentAction,
  PayloadSource
} from '@Lib/index';
import {
  createComponentItem,
  testExtensionEditorPackage,
  testThemeDefaultPackage,
  testThemeDarkPackage,
  testExtensionForTagsPackage,
  createNoteItem,
  registerComponent,
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
import { environmentToString, platformToString } from '../../../lib/platforms';

describe('Component Manager', () => {
  /** The global Standard Notes application. */
  let testSNApp;
  /** The global test component. */
  let testComponent;
  /** The global test theme. */
  let testTheme;

  beforeEach(async () => {
    testSNApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);
    /**
     * Lock syncing so that there aren't any sync requests that may affect new application instances.
     */
    testSNApp.syncService.lockSyncing();

    testComponent = await createComponentItem(testSNApp, testExtensionEditorPackage);
    testTheme = await createComponentItem(testSNApp, testThemeDefaultPackage);
  });

  afterEach(() => {
    testSNApp.deinit(DeinitSource.SignOut);
  });

  describe('isDesktop', () => {
    it('returns false if in a Web app', async () => {
      testSNApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);
      const { isDesktop } = testSNApp.componentManager;
      expect(isDesktop).toBe(false);
    });

    it('returns false if in a Mobile app', async () => {
      testSNApp = await createAndInitializeApplication('test-application', Environment.Mobile, Platform.Android);
      const { isDesktop } = testSNApp.componentManager;
      expect(isDesktop).toBe(false);
    });

    it('returns true if in a Desktop app', async () => {
      testSNApp = await createAndInitializeApplication('test-application', Environment.Desktop, Platform.LinuxDesktop);
      const { isDesktop } = testSNApp.componentManager;
      expect(isDesktop).toBe(true);
    });
  });

  describe('isMobile', () => {
    it('returns false if in a Web app', async () => {
      testSNApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);
      const { isMobile } = testSNApp.componentManager;
      expect(isMobile).toBe(false);
    });

    it('returns false if in a Desktop app', async () => {
      testSNApp = await createAndInitializeApplication('test-application', Environment.Desktop, Platform.LinuxDesktop);
      const { isMobile } = testSNApp.componentManager;
      expect(isMobile).toBe(false);
    });

    it('returns true if in a Mobile app', async () => {
      testSNApp = await createAndInitializeApplication('test-application', Environment.Mobile, Platform.Android);
      const { isMobile } = testSNApp.componentManager;
      expect(isMobile).toBe(true);
    });
  });

  describe('components', () => {
    it('returns an empty array if no items of type Component or Theme exist', async () => {
      const testApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);
      expect(testApp.componentManager.components).toHaveLength(0);
    });

    it('returns an array of items of type Component and Theme', async () => {
      const testApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);

      await createComponentItem(testApp, testExtensionEditorPackage);
      await createComponentItem(testApp, testThemeDefaultPackage);

      const { components } = testApp.componentManager;
      expect(components).toHaveLength(2);

      expect(components[0].content_type).toBe(ContentType.Component);
      expect(components[1].content_type).toBe(ContentType.Theme);
    });
  });

  describe('componentsForArea()', () => {
    it('returns an array of Component items', async () => {
      const testApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);

      await createComponentItem(testApp, testExtensionEditorPackage);
      await createComponentItem(testApp, testThemeDefaultPackage);
      await createComponentItem(testApp, testThemeDarkPackage);
      await createComponentItem(testApp, testExtensionForTagsPackage);

      const componentsInThemeArea = testApp.componentManager.componentsForArea(ComponentArea.Themes);
      expect(componentsInThemeArea).toHaveLength(2);

      const componentsInEditorArea = testApp.componentManager.componentsForArea(ComponentArea.Editor);
      expect(componentsInEditorArea).toHaveLength(1);

      const componentsInNoteTagsArea = testApp.componentManager.componentsForArea(ComponentArea.NoteTags);
      expect(componentsInNoteTagsArea).toHaveLength(1);
    });
  });

  describe('isNativeExtension()', () => {
    it('returns false if hosted_url or local_url do not match any of the native extensions location', async () => {
      let isNativeExtension = testSNApp.componentManager.isNativeExtension(testComponent);
      expect(isNativeExtension).toBe(false);

      isNativeExtension = testSNApp.componentManager.isNativeExtension(testTheme);
      expect(isNativeExtension).toBe(false);
    });

    it('returns true if location matches the Extensions manager location', async () => {
      const extensionsManagerPackage = {
        identifier: "test.standardnotes.extensions-manager-extension",
        name: "Extensions manager",
        content_type: "SN|Component",
        area: "modal",
        version: "1.0.0",
        url: "http://localhost/extensions/extension_manager"
      };

      const extensionManagerComponent = await createComponentItem(testSNApp, extensionsManagerPackage);
      const isNativeExtension = testSNApp.componentManager.isNativeExtension(extensionManagerComponent);
      expect(isNativeExtension).toBe(true);
    });

    // Will be removed soon.
    it('returns true if location matches the Batch manager location', async () => {
      const batchManagerPackage = {
        identifier: "test.standardnotes.batch-manager-extension",
        name: "Batch manager",
        content_type: "SN|Component",
        area: "modal",
        version: "1.0.0",
        url: "http://localhost/extensions/batch_manager"
      };

      const batchManagerComponent = await createComponentItem(testSNApp, batchManagerPackage);
      const isNativeExtension = testSNApp.componentManager.isNativeExtension(batchManagerComponent);
      expect(isNativeExtension).toBe(true);
    });
  });

  describe('getActiveThemes()', () => {
    describe('Web/Desktop', () => {
      it('returns all active themes', async () => {
        await createComponentItem(testSNApp, testThemeDefaultPackage);

        let activeThemes = testSNApp.componentManager.getActiveThemes();
        expect(activeThemes).toHaveLength(0);

        const defaultTheme = await createComponentItem(testSNApp, testThemeDefaultPackage, {
          active: true
        });
        const darkTheme = await createComponentItem(testSNApp, testThemeDarkPackage, {
          active: true
        });

        activeThemes = testSNApp.componentManager.getActiveThemes();
        expect(activeThemes).toHaveLength(2);
        expect(activeThemes[0]).toBe(defaultTheme);
        expect(activeThemes[1]).toBe(darkTheme);
      });
    });

    describe('Mobile', () => {
      it('returns just one theme', async () => {
        testSNApp = await createAndInitializeApplication('test-application', Environment.Mobile, Platform.Android);
        await createComponentItem(testSNApp, testThemeDefaultPackage, {
          active: true
        });

        let activeThemes = testSNApp.componentManager.getActiveThemes();
        expect(activeThemes).toHaveLength(0);

        const darkTheme = await createComponentItem(testSNApp, testThemeDarkPackage);
        testSNApp.componentManager.setMobileActiveTheme(darkTheme);

        activeThemes = testSNApp.componentManager.getActiveThemes();
        expect(activeThemes).toHaveLength(1);
        expect(activeThemes[0]).toBe(darkTheme);
      });
    });
  });

  describe('urlsForActiveThemes()', () => {
    it('returns an empty array if there are no active themes', async () => {
      const testApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);
      const urlsForActiveThemes = testApp.componentManager.urlsForActiveThemes();
      expect(urlsForActiveThemes).toHaveLength(0);
    });

    it('returns an array of URLs from the active themes', async () => {
      await createComponentItem(testSNApp, testThemeDefaultPackage);

      const defaultTheme = await createComponentItem(testSNApp, testThemeDefaultPackage, {
        active: true
      });
      const darkTheme = await createComponentItem(testSNApp, testThemeDarkPackage, {
        active: true
      });

      const urlsForActiveThemes = testSNApp.componentManager.urlsForActiveThemes();
      expect(urlsForActiveThemes).toHaveLength(2);
      expect(urlsForActiveThemes[0]).toBe(defaultTheme.hosted_url);
      expect(urlsForActiveThemes[1]).toBe(darkTheme.hosted_url);
    });
  });

  test('postActiveThemesToComponent()', async () => {
    const darkTheme = await createComponentItem(testSNApp, testThemeDarkPackage, {
      active: true
    });

    const sendMessageToComponent = jest.spyOn(
      testSNApp.componentManager,
      'sendMessageToComponent'
    );

    testSNApp.componentManager.postActiveThemesToComponent(testComponent);
    expect(sendMessageToComponent).toBeCalledTimes(1);
    expect(sendMessageToComponent).toBeCalledWith(testComponent, {
      action: ComponentAction.ActivateThemes,
      data: {
        themes: [darkTheme.hosted_url]
      }
    });
  });

  test('isComponentHidden()', async () => {
    let isComponentHidden = testSNApp.componentManager.isComponentHidden(testComponent);
    expect(isComponentHidden).toBe(false);

    testSNApp.componentManager.setComponentHidden(testComponent, true);

    isComponentHidden = testSNApp.componentManager.isComponentHidden(testComponent);
    expect(isComponentHidden).toBe(true);
  });

  describe('jsonForItem()', () => {
    /**
     * Checking that removes private properties is called.
     */
    let responseItemsByRemovingPrivateProperties
    
    beforeEach(() => {
      responseItemsByRemovingPrivateProperties = jest.spyOn(
        testSNApp.componentManager,
        'responseItemsByRemovingPrivateProperties'
      );
    });

    test('isMetadataUpdate property', async () => {
      const noteItem = await createNoteItem(testSNApp, {
        title: 'Note 1',
        text: 'This is a test note :B'
      });

      let jsonForItem = testSNApp.componentManager.jsonForItem(
        noteItem,
        testComponent
      );
      expect(jsonForItem.isMetadataUpdate).toBe(false);

      jsonForItem = testSNApp.componentManager.jsonForItem(
        noteItem,
        testComponent,
        PayloadSource.RemoteSaved
      );
      expect(jsonForItem.isMetadataUpdate).toBe(true);

      jsonForItem = testSNApp.componentManager.jsonForItem(
        noteItem,
        testComponent,
        PayloadSource.LocalSaved
      );
      expect(jsonForItem.isMetadataUpdate).toBe(true);

      jsonForItem = testSNApp.componentManager.jsonForItem(
        noteItem,
        testComponent,
        PayloadSource.PreSyncSave
      );
      expect(jsonForItem.isMetadataUpdate).toBe(true);

      jsonForItem = testSNApp.componentManager.jsonForItem(
        noteItem,
        testComponent,
        PayloadSource.FileImport
      );
      expect(jsonForItem.isMetadataUpdate).toBe(false);

      expect(responseItemsByRemovingPrivateProperties).toBeCalledTimes(5);
      expect(responseItemsByRemovingPrivateProperties).toBeCalledWith(
        [
          expect.objectContaining({
            uuid: noteItem.uuid
          })
        ],
        testComponent
      );
    });

    test('clientData property', async () => {
      const componentDataDomain = 'org.standardnotes.sn.components';
      const appData = {
        [testComponent.getClientDataKey()]: {
          foo: 'bar'
        }
      };

      let noteItemWithClientData = await createNoteItem(testSNApp, {
        title: 'Note 1',
        text: 'This is a test note :P'
      });
      noteItemWithClientData = await testSNApp.changeAndSaveItem(
        noteItemWithClientData.uuid,
        (mutator) => {
          mutator.setDomainData(appData, componentDataDomain);
        }
      );

      let jsonForItem = testSNApp.componentManager.jsonForItem(
        noteItemWithClientData,
        testComponent
      );
      expect(jsonForItem.clientData).toEqual(appData[testComponent.getClientDataKey()]);

      const noteItemWithoutClientData = await createNoteItem(testSNApp, {
        title: 'Note 2',
        text: 'This is another test note'
      });

      jsonForItem = testSNApp.componentManager.jsonForItem(
        noteItemWithoutClientData,
        testComponent
      );
      expect(jsonForItem.clientData).toEqual({});
      expect(responseItemsByRemovingPrivateProperties).toBeCalledTimes(2);
    });

    it('should have other item properties', async () => {
      const noteItem = await createNoteItem(testSNApp, {
        title: 'Note 1',
        text: 'This is a test note :-)'
      });

      const jsonForItem = testSNApp.componentManager.jsonForItem(
        noteItem,
        testComponent
      );
      expect(responseItemsByRemovingPrivateProperties).toBeCalledTimes(1);
      expect(responseItemsByRemovingPrivateProperties).toBeCalledWith(
        [
          expect.objectContaining({
            uuid: noteItem.uuid
          })
        ],
        testComponent
      );
      expect(jsonForItem).toMatchObject({
        uuid: noteItem.uuid,
        content_type: noteItem.content_type,
        created_at: noteItem.created_at,
        updated_at: noteItem.updated_at,
        deleted: undefined,
        content: {
          title: noteItem.content.title,
          text: noteItem.content.text
        }
      });
    });
  });

  describe('urlForComponent()', () => {
    describe('Desktop', () => {
      it('returns null because offlineOnly is available on desktop, and not on web or mobile', async () => {
        testSNApp = await createAndInitializeApplication('test-application', Environment.Mobile, Platform.Android);
        testComponent = await createComponentItem(testSNApp, testExtensionEditorPackage, {
          offlineOnly: true
        });

        const urlForComponent = testSNApp.componentManager.urlForComponent(testComponent);
        expect(urlForComponent).toBeNull();
      });

      it('replaces sn:// with the extensions server host', async () => {
        testSNApp = await createAndInitializeApplication('test-application', Environment.Desktop, Platform.LinuxDesktop);

        const extServerHost = 'https://127.0.0.1:45653/'
        const desktopManager = {
          getExtServerHost: jest.fn(() => extServerHost),
          registerUpdateObserver: jest.fn(),
          syncComponentsInstallation: jest.fn()
        };
        testSNApp.componentManager.setDesktopManager(desktopManager);

        testComponent = await createComponentItem(testSNApp, testExtensionEditorPackage, {
          offlineOnly: true,
          local_url: 'sn://my-local-editor'
        });

        const urlForComponent = testSNApp.componentManager.urlForComponent(testComponent);
        expect(urlForComponent).toBe(`${extServerHost}my-local-editor`);
      });
    });

    describe('Mobile', () => {
      it('replaces localhost or sn.local with localhost on iOS', async () => {
        testSNApp = await createAndInitializeApplication('test-application', Environment.Mobile, Platform.Ios);

        const localhostComponent = await createComponentItem(testSNApp, testExtensionEditorPackage, {
          hosted_url: 'http://localhost/my-extension-for-ios'
        });
        let urlForComponent = testSNApp.componentManager.urlForComponent(localhostComponent);
        expect(urlForComponent).toBe('http://localhost/my-extension-for-ios');

        const snLocalComponent = await createComponentItem(testSNApp, testExtensionEditorPackage, {
          hosted_url: 'http://sn.local/my-extension-for-ios'
        });
        urlForComponent = testSNApp.componentManager.urlForComponent(snLocalComponent);
        expect(urlForComponent).toBe('http://localhost/my-extension-for-ios');

        const remoteComponent = await createComponentItem(testSNApp, testExtensionEditorPackage, {
          hosted_url: 'https://remote-host.sn.org/my-extension-for-ios'
        });
        urlForComponent = testSNApp.componentManager.urlForComponent(remoteComponent);
        expect(urlForComponent).toBe('https://remote-host.sn.org/my-extension-for-ios');
      });

      it('replaces localhost or sn.local with 10.0.2.2 on Android', async () => {
        testSNApp = await createAndInitializeApplication('test-application', Environment.Mobile, Platform.Android);

        const localhostComponent = await createComponentItem(testSNApp, testExtensionEditorPackage, {
          hosted_url: 'http://localhost/my-extension-for-android'
        });
        let urlForComponent = testSNApp.componentManager.urlForComponent(localhostComponent);
        expect(urlForComponent).toBe('http://10.0.2.2/my-extension-for-android');

        const snLocalComponent = await createComponentItem(testSNApp, testExtensionEditorPackage, {
          hosted_url: 'http://sn.local/my-extension-for-android'
        });
        urlForComponent = testSNApp.componentManager.urlForComponent(snLocalComponent);
        expect(urlForComponent).toBe('http://10.0.2.2/my-extension-for-android');

        const remoteComponent = await createComponentItem(testSNApp, testExtensionEditorPackage, {
          hosted_url: 'https://remote-host.sn.org/my-extension-for-android'
        });
        urlForComponent = testSNApp.componentManager.urlForComponent(remoteComponent);
        expect(urlForComponent).toBe('https://remote-host.sn.org/my-extension-for-android');
      });
    });

    it('returns the hosted_url as-is', async () => {
      const urlForComponent = testSNApp.componentManager.urlForComponent(testComponent);
      expect(urlForComponent).toBe(testComponent.hosted_url);
    });
  });

  describe('componentForUrl()', () => {
    it('returns the first component that matches the url', async () => {
      const firstComponentSameUrl = await createComponentItem(testSNApp, testExtensionEditorPackage, {
        hosted_url: 'http://localhost/my-extension'
      });

      let componentForUrl = testSNApp.componentManager.componentForUrl('http://localhost/my-extension');
      expect(componentForUrl).toBe(firstComponentSameUrl);

      const secondComponentSameUrl = await createComponentItem(testSNApp, testExtensionEditorPackage, {
        hosted_url: 'http://localhost/my-extension'
      });

      componentForUrl = testSNApp.componentManager.componentForUrl('http://localhost/my-extension');
      expect(componentForUrl).not.toBe(secondComponentSameUrl);
      expect(componentForUrl).toBe(firstComponentSameUrl);
    });
  });

  describe('sessionKeyForComponent()', () => {
    it('returns undefined if the component has not been registered', () => {
      const sessionKey = testSNApp.componentManager.sessionKeyForComponent(testComponent);
      expect(sessionKey).toBeUndefined();
    });

    it('returns a valid value if the component is registered', async () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      await registerComponent(testSNApp, iframe.contentWindow, testComponent);

      const sessionKey = testSNApp.componentManager.sessionKeyForComponent(testComponent);
      expect(sessionKey).toBeDefined();
    });
  });

  describe('componentForSessionKey()', () => {
    it('returns undefined if the session key does not exist', () => {
      const component = testSNApp.componentManager.componentForSessionKey('a-session-key');
      expect(component).toBeUndefined();
    });

    it('returns a valid component if the session key exists', async () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      await registerComponent(testSNApp, iframe.contentWindow, testComponent);

      const sessionKey = testSNApp.componentManager.sessionKeyForComponent(testComponent);
      const component = testSNApp.componentManager.componentForSessionKey(sessionKey);
      expect(component).toBeDefined();
    });

    it('finds a component that was registered via registerHandler', () => {
      const customActionHandler = jest.fn();
      const componentForSessionKeyHandler = jest.fn((key) => {
        if (key === 'my-component-key') {
          return testComponent;
        }
      });
      registerComponentHandler(
        testSNApp,
        [testComponent.area],
        undefined,
        customActionHandler,
        componentForSessionKeyHandler
      );

      const component = testSNApp.componentManager.componentForSessionKey('my-component-key');
      expect(component).toBeDefined();
      expect(component).toBe(testComponent);
    });
  });

  describe('responseItemsByRemovingPrivateProperties()', () => {
    it('returns responseItems as-is if the component is a native extension', async () => {
      const batchManagerPackage = {
        identifier: "test.standardnotes.batch-manager-extension",
        name: "Batch manager",
        content_type: "SN|Component",
        area: "modal",
        version: "1.0.0",
        url: "http://localhost/extensions/batch_manager"
      };
      const batchManagerComponent = await createComponentItem(testSNApp, batchManagerPackage);
      const responseItems = [
        {
          foo: 'bar',
          test: 'testing'
        }
      ];
      
      const returnedItems = testSNApp.componentManager.responseItemsByRemovingPrivateProperties(
        responseItems,
        batchManagerComponent
      );
      expect(returnedItems).toEqual(responseItems);
    });

    it('does not include private content properties', async () => {
      const responseItems = [
        {
          foo: 'bar',
          test: 'testing',
          content: {
            text: 'test',
            active: true,
            permissions: [],
            autoupdateDisabled: true
          }
        }
      ];
      
      const returnedItems = testSNApp.componentManager.responseItemsByRemovingPrivateProperties(
        responseItems,
        testComponent
      );
      expect(returnedItems).toEqual([
        {
          foo: 'bar',
          test: 'testing',
          content: {
            text: 'test'
          }
        }
      ]);
    });

    it('returns the item as-is if the content key is a string', async () => {
      const responseItems = [
        {
          foo: 'bar',
          test: 'testing',
          content: 'this is a string'
        }
      ];
      
      const returnedItems = testSNApp.componentManager.responseItemsByRemovingPrivateProperties(
        responseItems,
        testComponent
      );
      expect(returnedItems).toEqual(responseItems);
    });

    it('returns the item as-is if the content key is not present', async () => {
      const responseItems = [
        {
          foo: 'bar',
          test: 'testing'
        }
      ];
      
      const returnedItems = testSNApp.componentManager.responseItemsByRemovingPrivateProperties(
        responseItems,
        testComponent
      );
      expect(returnedItems).toEqual(responseItems);
    });

    it('includes hosted_url, local_url or url properties when includeUrls is true', async () => {
      const responseItems = [
        {
          foo: 'bar',
          test: 'testing',
          content: {
            text: 'test',
            active: true,
            permissions: [],
            autoupdateDisabled: true,
            hosted_url: 'test',
            local_url: 'test',
            url: 'test'
          }
        }
      ];
      
      const returnedItems = testSNApp.componentManager.responseItemsByRemovingPrivateProperties(
        responseItems,
        testComponent,
        true
      );
      expect(returnedItems).toEqual([
        {
          foo: 'bar',
          test: 'testing',
          content: {
            text: 'test'
          }
        }
      ]);
    });
  });

  describe('itemIdsInContextJurisdictionForComponent()', () => {
    it('returns an empty array if no handler is registered', () => {
      const itemIds = testSNApp.componentManager.itemIdsInContextJurisdictionForComponent(testComponent);
      expect(itemIds).toHaveLength(0);
    });

    it('returns item ids in context for the component', async () => {
      const itemInContext = await createNoteItem(testSNApp, { title: 'Note 1' });
      await createNoteItem(testSNApp, { title: 'Note 2' });

      const customActionHandler = jest.fn();
      registerComponentHandler(
        testSNApp,
        [testComponent.area],
        itemInContext,
        customActionHandler
      );

      const itemIds = testSNApp.componentManager.itemIdsInContextJurisdictionForComponent(testComponent);
      expect(itemIds).toHaveLength(1);
      expect(itemIds[0]).toEqual(itemInContext.uuid);
    });

    it('checks if the item is in jurisdiction of component', async () => {
      const itemInContext = await createNoteItem(testSNApp, { title: 'Note 1' });
      const anotherNote = await createNoteItem(testSNApp, { title: 'Note 2' });

      const customActionHandler = jest.fn();
      registerComponentHandler(
        testSNApp,
        [testComponent.area],
        itemInContext,
        customActionHandler
      );

      let isItemInJurisdiction = testSNApp.componentManager.isItemIdWithinComponentContextJurisdiction(
        itemInContext.uuid,
        testComponent
      );
      expect(isItemInJurisdiction).toBe(true);

      isItemInJurisdiction = testSNApp.componentManager.isItemIdWithinComponentContextJurisdiction(
        anotherNote.uuid,
        testComponent
      );
      expect(isItemInJurisdiction).toBe(false);
    });
  });

  test('handlersForArea() returns handlers in the specified area', () => {
    const customActionHandler = jest.fn();
    registerComponentHandler(
      testSNApp,
      [ComponentArea.Editor, ComponentArea.Rooms],
      undefined,
      customActionHandler
    );

    const handlersInEditorArea = testSNApp.componentManager.handlersForArea(ComponentArea.Editor);
    expect(handlersInEditorArea).toHaveLength(1);

    const handlersInRoomsArea = testSNApp.componentManager.handlersForArea(ComponentArea.Rooms);
    expect(handlersInRoomsArea).toHaveLength(1);

    let handlersInTagsListArea = testSNApp.componentManager.handlersForArea(ComponentArea.TagsList);
    expect(handlersInTagsListArea).toHaveLength(0);

    registerComponentHandler(
      testSNApp,
      [ComponentArea.TagsList],
      undefined,
      customActionHandler
    );

    handlersInTagsListArea = testSNApp.componentManager.handlersForArea(ComponentArea.TagsList);
    expect(handlersInTagsListArea).toHaveLength(1);
  });

  describe('runWithPermissions()', () => {
    let runFunction;

    beforeEach(async () => {
      testSNApp = await createAndInitializeApplication('test-application', Environment.Web, Platform.LinuxWeb);
      testComponent = await createComponentItem(testSNApp, testExtensionEditorPackage);
      runFunction = jest.fn();
    });

    test('the specified function will be executed if no required permissions', () => {
      /**
       * Rejecting any permission prompts, since we are expecting to execute the function
       * without any explicit permissions.
       */
      window.confirm = (message) => false;

      testSNApp.componentManager.runWithPermissions(
        testComponent.uuid,
        [],
        runFunction
      );
      expect(runFunction).toBeCalledTimes(1);
    });

    test('the specified function will be executed only if the permission prompt is approved', async () => {
      /**
       * Initially rejecting any permission prompts.
       */
      window.confirm = (message) => false;

      const requiredPermissions = [
        {
          name: ComponentAction.CreateItem,
        }
      ];

      testSNApp.componentManager.runWithPermissions(
        testComponent.uuid,
        requiredPermissions,
        runFunction
      );
      await sleep(SHORT_DELAY_TIME);
      expect(runFunction).toBeCalledTimes(0);

      /**
       * Approving any subsequent permission prompts.
       */
      window.confirm = (message) => true;

      testSNApp.componentManager.runWithPermissions(
        testComponent.uuid,
        requiredPermissions,
        runFunction
      );
      await sleep(SHORT_DELAY_TIME);
      expect(runFunction).toBeCalledTimes(1);
    });

    test('already adquired permissions should not be requested again', async () => {
      const promptForPermissions = jest.spyOn(
        testSNApp.componentManager,
        'promptForPermissions'
      );

      /**
       * Approving all permission prompts.
       */
      window.confirm = (message) => true;

      const requiredPermissions1 = [
        {
          name: ComponentAction.CreateItems,
          content_types: [ContentType.Tag]
        }
      ];

      testSNApp.componentManager.runWithPermissions(
        testComponent.uuid,
        requiredPermissions1,
        runFunction
      );
      await sleep(SHORT_DELAY_TIME);
      expect(runFunction).toBeCalledTimes(1);

      expect(promptForPermissions).toBeCalledTimes(1);
      expect(promptForPermissions).toHaveBeenLastCalledWith(
        testComponent,
        requiredPermissions1,
        expect.any(Function)
      );
 
      const requiredPermissions2 = [
        {
          name: ComponentAction.CreateItems,
          content_types: [ContentType.Tag]
        },
        {
          name: ComponentAction.StreamContextItem
        }
      ];
 
      testSNApp.componentManager.runWithPermissions(
        testComponent.uuid,
        requiredPermissions2,
        runFunction
      );
      await sleep(SHORT_DELAY_TIME);
      expect(runFunction).toBeCalledTimes(2);

      expect(promptForPermissions).toBeCalledTimes(2);
      expect(promptForPermissions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          uuid: testComponent.uuid
        }),
        [
          {
            name: ComponentAction.StreamContextItem
          }
        ],
        expect.any(Function)
      );
    });
  });

  test('findOrCreateDataForComponent()', async () => {
    /**
     * Creating a new test component should have an empty componentData object.
     */
    testComponent = await createComponentItem(testSNApp, testExtensionEditorPackage);

    const componentUuid = testComponent.uuid;
    const { componentState } = testSNApp.componentManager;

    expect(componentState[componentUuid]).toBeUndefined();

    let componentData = testSNApp.componentManager.findOrCreateDataForComponent(componentUuid);
    expect(componentData).toEqual({});

    componentState[componentUuid] = {
      foo: 'bar'
    };
    componentData = testSNApp.componentManager.findOrCreateDataForComponent(componentUuid);
    expect(componentData).toEqual({
      foo: 'bar'
    });
  });

  test('getReadonlyStateForComponent() and setReadonlyStateForComponent()', () => {
    let readonlyState = testSNApp.componentManager.getReadonlyStateForComponent(
      testComponent
    );
    expect(readonlyState).toEqual({
      readonly: undefined,
      lockReadonly: undefined
    });

    testSNApp.componentManager.setReadonlyStateForComponent(
      testComponent,
      true
    );
    readonlyState = testSNApp.componentManager.getReadonlyStateForComponent(
      testComponent
    );
    expect(readonlyState).toEqual({
      readonly: true,
      lockReadonly: false
    });

    testSNApp.componentManager.setReadonlyStateForComponent(
      testComponent,
      true,
      true
    );
    readonlyState = testSNApp.componentManager.getReadonlyStateForComponent(
      testComponent
    );
    expect(readonlyState).toEqual({
      readonly: true,
      lockReadonly: true
    });

    testSNApp.componentManager.setReadonlyStateForComponent(
      testComponent,
      false
    );
    readonlyState = testSNApp.componentManager.getReadonlyStateForComponent(
      testComponent
    );
    expect(readonlyState).toEqual({
      readonly: false,
      lockReadonly: false
    });

    testSNApp.componentManager.setReadonlyStateForComponent(
      testComponent,
      false,
      true
    );
    readonlyState = testSNApp.componentManager.getReadonlyStateForComponent(
      testComponent
    );
    expect(readonlyState).toEqual({
      readonly: false,
      lockReadonly: true
    });
  });

  describe('registerComponentWindow()', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);

    it('sends ComponentRegistered message to component', async () => {
      const sendMessageToComponent = jest.spyOn(
        testSNApp.componentManager,
        'sendMessageToComponent'
      );

      await testSNApp.componentManager.registerComponentWindow(
        testComponent,
        iframe.contentWindow
      );
      expect(sendMessageToComponent).nthCalledWith(1,
        testComponent,
        {
          action: ComponentAction.ComponentRegistered,
          sessionKey: expect.any(String),
          componentData: testComponent.componentData,
          data: {
            uuid: testComponent.uuid,
            environment: environmentToString(testSNApp.componentManager.environment),
            platform: platformToString(testSNApp.componentManager.platform),
            activeThemeUrls: testSNApp.componentManager.urlsForActiveThemes()
          }
        }
      );
    });

    it('posts active themes to component', async () => {
      const postActiveThemesToComponent = jest.spyOn(
        testSNApp.componentManager,
        'postActiveThemesToComponent'
      );

      await testSNApp.componentManager.registerComponentWindow(
        testComponent,
        iframe.contentWindow
      );
      expect(postActiveThemesToComponent).toBeCalledTimes(1);
      expect(postActiveThemesToComponent).toBeCalledWith(testComponent);
    });

    it('notifies component activate through desktopManagerr', async () => {
      const extServerHost = 'https://127.0.0.1:45653/'
      const desktopManager = {
        getExtServerHost: jest.fn(() => extServerHost),
        registerUpdateObserver: jest.fn(),
        syncComponentsInstallation: jest.fn(),
        notifyComponentActivation: jest.fn()
      };
      testSNApp.componentManager.setDesktopManager(desktopManager);

      await testSNApp.componentManager.registerComponentWindow(
        testComponent,
        iframe.contentWindow
      );
      expect(desktopManager.notifyComponentActivation).toBeCalledTimes(1);
      expect(desktopManager.notifyComponentActivation).toBeCalledWith(testComponent);
    });
  });

  test('isComponentActive() returns the active property from the component', () => {
    const isComponentActive = testSNApp.componentManager.isComponentActive(
      testComponent
    );
    expect(isComponentActive).toBe(testComponent.active);
  });

  describe('editorForNote()', () => {
    let testNote;
    let editorComponent;

    beforeEach(async () => {
      testNote = await createNoteItem(testSNApp, {
        title: 'Note 1'
      });
      editorComponent = await createComponentItem(
        testSNApp,
        testExtensionEditorPackage
      );
    });

    it('returns the explicit enabled editor for a note', async () => {
      await testSNApp.itemManager.changeComponent(
        editorComponent.uuid,
        (mutator) => {
          mutator.associateWithItem(testNote.uuid);
        }
      );

      const editorForNote = testSNApp.componentManager.editorForNote(
        testNote
      );
      expect(editorForNote.uuid).toBe(editorComponent.uuid);
    });

    test('if no editor for note found, return undefined', async () => {
      const editorForNote = testSNApp.componentManager.editorForNote(
        testNote
      );
      expect(editorForNote).toBeUndefined();
    });

    it('returns the default editor for note', async () => {
      await testSNApp.itemManager.changeComponent(
        editorComponent.uuid,
        (mutator) => {
          mutator.defaultEditor = true;
        }
      );

      const editorForNote = testSNApp.componentManager.editorForNote(
        testNote
      );
      expect(editorForNote.uuid).toBe(editorComponent.uuid);
    });

    test('on mobile, return default editor if plain editor is not prefered', async () => {
      testSNApp = await createAndInitializeApplication('test-application', Environment.Mobile, Platform.Android);
      testNote = await createNoteItem(testSNApp, {
        title: 'Note 1'
      });
      editorComponent = await createComponentItem(
        testSNApp,
        testExtensionEditorPackage
      );
      await testSNApp.itemManager.changeComponent(
        editorComponent.uuid,
        (mutator) => {
          mutator.isMobileDefault = true;
        }
      );

      const editorForNote = testSNApp.componentManager.editorForNote(
        testNote
      );
      expect(editorForNote.uuid).toBe(editorComponent.uuid);
    });
  });

  describe('getDefaultEditor()', () => {
    it('returns the first default editor', async () => {
      await testSNApp.itemManager.changeComponent(
        testComponent.uuid,
        (mutator) => {
          mutator.defaultEditor = true;
        }
      );

      const defaultEditor = testSNApp.componentManager.getDefaultEditor();
      expect(defaultEditor.uuid).toBe(
        testComponent.uuid
      );
    });

    it('returns the first default editor on mobile', async () => {
      testSNApp = await createAndInitializeApplication('test-application', Environment.Mobile, Platform.Android);
      const editorComponent = await createComponentItem(
        testSNApp,
        testExtensionEditorPackage
      );
      await testSNApp.itemManager.changeComponent(
        editorComponent.uuid,
        (mutator) => {
          mutator.isMobileDefault = true;
        }
      );

      const anotherEditorComponent = await createComponentItem(
        testSNApp,
        testExtensionEditorPackage
      );
      await testSNApp.itemManager.changeComponent(
        anotherEditorComponent.uuid,
        (mutator) => {
          mutator.defaultEditor = true;
        }
      );

      const defaultEditor = testSNApp.componentManager.getDefaultEditor();
      expect(defaultEditor.uuid).toBe(
        editorComponent.uuid
      );
    });
  });

  describe('permissionsStringForPermissions()', () => {
    test('StreamItems with a single content type', () => {
      const permissionString = testSNApp.componentManager.permissionsStringForPermissions(
        [
          {
            name: ComponentAction.StreamItems,
            content_types: [ContentType.Tag]
          }
        ],
        testComponent
      );
      expect(permissionString).toBe('tags.');
    });

    test('StreamItems with more than a content type', () => {
      const permissionString = testSNApp.componentManager.permissionsStringForPermissions(
        [
          {
            name: ComponentAction.StreamItems,
            content_types: [ContentType.Tag, ContentType.SmartTag]
          }
        ],
        testComponent
      );
      expect(permissionString).toBe('tags, smart tags.');
    });

    test('StreamContextItem returns "working note"', () => {
      const permissionString = testSNApp.componentManager.permissionsStringForPermissions(
        [
          {
            name: ComponentAction.StreamContextItem
          }
        ],
        testComponent
      );
      expect(permissionString).toBe('working note.');
    });

    test('a permission array with StreamItems with two content types and then StreamContextItem', () => {
      const permissionString = testSNApp.componentManager.permissionsStringForPermissions(
        [
          {
            name: ComponentAction.StreamItems,
            content_types: [ContentType.Tag, ContentType.SmartTag]
          },
          {
            name: ComponentAction.StreamContextItem
          }
        ],
        testComponent
      );
      expect(permissionString).toBe('tags, smart tags, working note.');
    });

    test('a permission array with StreamContextItem and then StreamItems with two content types', () => {
      const permissionString = testSNApp.componentManager.permissionsStringForPermissions(
        [
          {
            name: ComponentAction.StreamContextItem
          },
          {
            name: ComponentAction.StreamItems,
            content_types: [ContentType.Tag, ContentType.SmartTag]
          }
        ],
        testComponent
      );
      expect(permissionString).toBe('tags, smart tags, working note.');
    });

    test('an empty permission array returns "."', () => {
      const permissionString = testSNApp.componentManager.permissionsStringForPermissions(
        [],
        testComponent
      );
      expect(permissionString).toBe('.');
    });
  });
});
