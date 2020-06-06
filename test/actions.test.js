/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
import * as Factory from './lib/factory.js';
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('actions service', () => {
  before(async function () {
    // Set timeout for all tests.
    this.timeout(Factory.TestTimeout);

    localStorage.clear();

    this.application = await Factory.createInitAppWithRandNamespace();
    const email = Uuid.GenerateUuidSynchronously();
    const password = Uuid.GenerateUuidSynchronously();

    await Factory.registerUserToApplication({
      application: this.application,
      email: email,
      password: password
    });

    this.fakeServer = sinon.fakeServer.create();
    this.fakeServer.respondImmediately = true;

    this.actionsExtension = {
      identifier: 'org.standardnotes.testing',
      name: 'Test extension',
      content_type: 'Extension',
      url: 'http://my-extension.sn.org/install/',
      description: 'For testing purposes.',
      supported_types: [
        'Note'
      ],
      actions: [
        {
          label: 'Action #1',
          url: 'http://my-extension.sn.org/action_1/',
          verb: 'get',
          context: '*',
          content_types: [
            'Note'
          ]
        },
        {
          label: 'Action #2',
          url: 'http://my-extension.sn.org/action_2/',
          verb: 'render',
          context: 'Note',
          content_types: [
            'Note'
          ]
        },
        {
          label: 'Action #3',
          url: 'http://my-extension.sn.org/action_3/',
          verb: 'show',
          context: 'Tag',
          content_types: [
            'Note'
          ]
        },
        {
          label: 'Action #4',
          url: 'http://my-extension.sn.org/action_4/',
          verb: 'post',
          context: 'Item',
          content_types: [
            'Note'
          ],
          access_type: 'decrypted'
        },
      ]
    };

    this.fakeServer.respondWith('GET', 'http://my-extension.sn.org/install/', [
      200,
      { 'Content-Type': 'application/json' },
      JSON.stringify(this.actionsExtension)
    ]);

    this.fakeServer.respondWith('GET', 'http://my-extension.sn.org/action_1/', [
      200,
      { 'Content-Type': 'application/json' },
      JSON.stringify({})
    ]);

    this.fakeServer.respondWith('GET', 'http://my-extension.sn.org/action_2/', [
      200,
      { 'Content-Type': 'application/json' },
      JSON.stringify({})
    ]);

    this.fakeServer.respondWith('GET', 'http://my-extension.sn.org/action_3/', [
      200,
      { 'Content-Type': 'application/json' },
      JSON.stringify({})
    ]);

    this.fakeServer.respondWith('POST', 'http://my-extension.sn.org/action_4/', [
      200,
      { 'Content-Type': 'application/json' },
      JSON.stringify({})
    ]);

    // Extension item
    this.extensionItem = await this.application.itemManager.createItem(
      ContentType.ActionsExtension,
      {
        ...this.actionsExtension,
        uuid: Factory.generateUuid(),
      }
    );
  });

  beforeEach(async function () {
    this.itemManager = this.application.itemManager;
    this.actionsManager = this.application.actionsManager;
  });

  afterEach(function () {
    
  });

  after(function () {
    this.fakeServer.restore();
    this.application.deinit();
    this.application = null;
    localStorage.clear();
  });

  it('should get extension items', async function () {
    await this.itemManager.createItem(
      ContentType.Note,
      {
        title: 'A simple note',
        text: 'Standard Notes rocks! lml.'
      }
    );
    const extensions = this.actionsManager.getExtensions();
    expect(extensions.length).to.eq(1);
  });

  it('should get extensions in context of item', async function () {
    const noteItem = await this.itemManager.createItem(
      ContentType.Note,
      {
        title: 'Another note',
        text: 'Whiskey In The Jar'
      }
    );

    const noteItemExtensions = this.actionsManager.extensionsInContextOfItem(noteItem);
    expect(noteItemExtensions.length).to.eq(1);
    expect(noteItemExtensions[0].supported_types).to.include(noteItem.content_type);
  });

  it('should get actions based on item context', async function () {
    const tagItem = await this.itemManager.createItem(
      ContentType.Tag,
      {
        title: 'Music'
      }
    );

    const tagActions = this.extensionItem.actionsWithContextForItem(tagItem);
    expect(tagActions.length).to.eq(2);
    expect(tagActions.map(action => action.label)).to.have.members(['Action #3', 'Action #4']);
  });

  it('should load extension in context of item', async function () {
    const noteItem = await this.itemManager.createItem(
      ContentType.Note,
      {
        title: 'Yet another note',
        text: 'And all things will end ♫'
      }
    );

    // Works
    const result1 = await this.application.httpService.getAbsolute(this.extensionItem.url);

    // Returns 404
    const result2 = await this.actionsManager.loadExtensionInContextOfItem(this.extensionItem, noteItem);
  });
});
