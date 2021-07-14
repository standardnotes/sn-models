import { CreateMaxPayloadFromAnyObject, PayloadSource } from '@Lib/index';
import { CreateItemFromPayload, SNPredicate } from '@Lib/models';
import { PayloadManager, ItemManager } from '@Lib/services';
import { Uuid } from '@Lib/uuid';
import * as Factory from '../factory';
import SNCrypto from '../setup/snjs/snCrypto';

const createItemParams = function () {
  const params = {
    uuid: Factory.generateUuidish(),
    content_type: 'Item',
    content: {
      title: 'Hello',
      desc: 'World',
      numbers: ['1', '2', '3'],
      tags: [
        {
          title: 'foo',
          id: Math.random(),
        },
        {
          title: 'bar',
          id: Math.random(),
        },
        {
          title: 'far',
          id: Math.random(),
        },
      ],
    },
  };
  return params;
};

describe('predicates', function () {
  const createItem = async () => {
    const payload = CreateMaxPayloadFromAnyObject(createItemParams());
    const template = CreateItemFromPayload(payload);
    return itemManager.insertItem(template);
  };

  let itemManager;

  beforeAll(async function () {
    const crypto = new SNCrypto();
    Uuid.SetGenerators(crypto.generateUUIDSync, crypto.generateUUID);
  });

  beforeEach(function () {
    itemManager = new PayloadManager();
    itemManager = new ItemManager(itemManager);
  });

  it('test and operator', async function () {
    const item = await createItem();
    expect(
      item.satisfiesPredicate(
        new SNPredicate('this_field_ignored', 'and', [
          ['content.title', '=', 'Hello'],
          ['content_type', '=', 'Item'],
        ])
      )
    ).toBe(true);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'and', [
          ['content.title', '=', 'Wrong'],
          ['content_type', '=', 'Item'],
        ])
      )
    ).toBe(false);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'and', [
          ['content.title', '=', 'Hello'],
          ['content_type', '=', 'Wrong'],
        ])
      )
    ).toBe(false);
  });

  it('test or operator', async function () {
    const item = await createItem();
    expect(
      item.satisfiesPredicate(
        new SNPredicate('this_field_ignored', 'or', [
          ['content.title', '=', 'Hello'],
          ['content_type', '=', 'Item'],
        ])
      )
    ).toBe(true);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'or', [
          ['content.title', '=', 'Wrong'],
          ['content_type', '=', 'Item'],
        ])
      )
    ).toBe(true);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'or', [
          ['content.title', '=', 'Hello'],
          ['content_type', '=', 'Wrong'],
        ])
      )
    ).toBe(true);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'or', [
          ['content.title', '=', 'Wrong'],
          ['content_type', '=', 'Wrong'],
        ])
      )
    ).toBe(false);
  });

  it('test not operator', async function () {
    const item = await createItem();
    expect(
      item.satisfiesPredicate(
        new SNPredicate('this_field_ignored', 'not', [
          'content.title',
          '=',
          'Not This Title',
        ])
      )
    ).toBe(true);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('this_field_ignored', 'not', [
          'content.title',
          '=',
          'Hello',
        ])
      )
    ).toBe(false);

    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'and', [
          ['', 'not', ['content.tags', 'includes', ['title', '=', 'far']]],
          ['content.tags', 'includes', ['title', '=', 'foo']],
        ])
      )
    ).toBe(false);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'and', [
          ['', 'not', ['content.tags', 'includes', ['title', '=', 'boo']]],
          ['content.tags', 'includes', ['title', '=', 'foo']],
        ])
      )
    ).toBe(true);

    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'not', [
          '',
          'and',
          [
            ['content.title', 'startsWith', 'H'],
            ['content.tags', 'includes', ['title', '=', 'falsify']],
          ],
        ])
      )
    ).toBe(true);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'not', [
          '',
          'and',
          [
            ['content.title', 'startsWith', 'H'],
            ['content.tags', 'includes', ['title', '=', 'foo']],
          ],
        ])
      )
    ).toBe(false);

    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'not', [
          '',
          'or',
          [
            ['content.title', 'startsWith', 'H'],
            ['content.tags', 'includes', ['title', '=', 'falsify']],
          ],
        ])
      )
    ).toBe(false);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('', 'not', [
          '',
          'or',
          [
            ['content.title', 'startsWith', 'Z'],
            ['content.tags', 'includes', ['title', '=', 'falsify']],
          ],
        ])
      )
    ).toBe(true);
  });

  it('test deep nested recursive operator', async function () {
    const item = await createItem();
    expect(
      item.satisfiesPredicate(
        new SNPredicate('this_field_ignored', 'and', [
          ['content.title', '=', 'Hello'],
          [
            'this_field_ignored',
            'or',
            [
              ['content.title', '=', 'Wrong'],
              ['content.title', '=', 'Wrong again'],
              ['content.title', '=', 'Hello'],
            ],
          ],
        ])
      )
    ).toBe(true);

    expect(
      item.satisfiesPredicate(
        new SNPredicate('this_field_ignored', 'and', [
          ['content.title', '=', 'Hello'],
          [
            'this_field_ignored',
            'or',
            [
              ['content.title', '=', 'Wrong'],
              ['content.title', '=', 'Wrong again'],
              ['content.title', '=', 'All wrong'],
            ],
          ],
        ])
      )
    ).toBe(false);
  });

  it('test custom and', async function () {
    const item = await createItem();
    const changedItem = await itemManager.changeItem(
      item.uuid,
      (mutator) => {
        mutator.pinned = true;
        mutator.protected = true;
      }
    );
    const predicate = new SNPredicate('this_field_ignored', 'and', [
      ['pinned', '=', true],
      ['content.protected', '=', true],
    ]);
    expect(changedItem.satisfiesPredicate(predicate)).toBe(true);
  });

  it('test compound', async function () {
    const item = await createItem();
    const changedItem = await itemManager.changeItem(
      item.uuid,
      (mutator) => {
        mutator.pinned = true;
        mutator.protected = true;
      }
    );
    const pinnedPred = new SNPredicate('pinned', '=', true);
    const protectedPred = new SNPredicate('content.protected', '=', true);
    const compoundProd = SNPredicate.CompoundPredicate([
      pinnedPred,
      protectedPred,
    ]);
    expect(changedItem.satisfiesPredicate(compoundProd)).toBe(true);
  });

  it('test equality', async function () {
    const item = await createItem();

    expect(
      item.satisfiesPredicate(new SNPredicate('content_type', '=', 'Foo'))
    ).toBe(false);
    expect(
      item.satisfiesPredicate(new SNPredicate('content_type', '=', 'Item'))
    ).toBe(true);

    expect(
      item.satisfiesPredicate(new SNPredicate('content.title', '=', 'Foo'))
    ).toBe(false);
    expect(
      item.satisfiesPredicate(new SNPredicate('content.title', '=', 'Hello'))
    ).toBe(true);

    expect(
      item.satisfiesPredicate(new SNPredicate('content.numbers', '=', ['1']))
    ).toBe(false);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('content.numbers', '=', ['1', '2', '3'])
      )
    ).toBe(true);
  });

  it('test inequality', async function () {
    const item = await createItem();

    expect(
      item.satisfiesPredicate(new SNPredicate('content_type', '!=', 'Foo'))
    ).toBe(true);
    expect(
      item.satisfiesPredicate(new SNPredicate('content_type', '!=', 'Item'))
    ).toBe(false);

    expect(
      item.satisfiesPredicate(new SNPredicate('content.title', '!=', 'Foo'))
    ).toBe(true);
    expect(
      item.satisfiesPredicate(new SNPredicate('content.title', '!=', 'Hello'))
    ).toBe(false);

    expect(
      item.satisfiesPredicate(new SNPredicate('content.numbers', '!=', ['1']))
    ).toBe(true);
    expect(
      item.satisfiesPredicate(
        new SNPredicate('content.numbers', '!=', ['1', '2', '3'])
      )
    ).toBe(false);
  });

  it('test nonexistent property', async function () {
    const item = await createItem();
    expect(
      item.satisfiesPredicate(new SNPredicate('foobar', '!=', 'Foo'))
    ).toBe(true);
    expect(
      item.satisfiesPredicate(new SNPredicate('foobar', '=', 'Foo'))
    ).toBe(false);

    expect(item.satisfiesPredicate(new SNPredicate('foobar', '<', 3))).toBe(false);
    expect(item.satisfiesPredicate(new SNPredicate('foobar', '>', 3))).toBe(false);
    expect(
      item.satisfiesPredicate(new SNPredicate('foobar', '<=', 3))
    ).toBe(false);
    expect(
      item.satisfiesPredicate(new SNPredicate('foobar', 'includes', 3))
    ).toBe(false);
  });

  it('test includes', async function () {
    const item = await createItem();
    expect(
      item.satisfiesPredicate(
        new SNPredicate('content.tags', 'includes', ['title', '=', 'bar'])
      )
    ).toBe(true);
    expect(
      item.satisfiesPredicate(
        new SNPredicate(
          'content.tags',
          'includes',
          new SNPredicate('title', '=', 'bar')
        )
      )
    ).toBe(true);
    expect(
      item.satisfiesPredicate(
        new SNPredicate(
          'content.tags',
          'includes',
          new SNPredicate('title', '=', 'foobar')
        )
      )
    ).toBe(false);
    expect(
      item.satisfiesPredicate(
        new SNPredicate(
          'content.tags',
          'includes',
          new SNPredicate('title', '=', 'foo')
        )
      )
    ).toBe(true);
  });

  it('test dynamic appData values', async function () {
    const item = await createItem();
    const changedItem = await itemManager.changeItem(
      item.uuid,
      (mutator) => {
        mutator.archived = true;
      }
    );

    expect(
      changedItem.satisfiesPredicate(new SNPredicate('archived', '=', true))
    ).toBe(true);
    expect(changedItem.satisfiesPredicate(['archived', '=', true])).toBe(true);
    expect(
      changedItem.satisfiesPredicate(JSON.parse('["archived", "=", true]'))
    ).toBe(true);
    expect(
      changedItem.satisfiesPredicate(JSON.parse('["archived", "=", false]'))
    ).toBe(false);
  });

  it('item manager predicate matching', async function () {
    const payload1 = CreateMaxPayloadFromAnyObject({
      ...createItemParams(),
      updated_at: new Date(),
    });
    await itemManager.emitItemFromPayload(payload1, PayloadSource.LocalSaved);

    const predicate = new SNPredicate('content.title', '=', 'ello');
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(0);

    predicate.keypath = 'content.desc';
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(0);

    predicate.keypath = 'content.title';
    predicate.value = 'Hello';
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(1);

    predicate.keypath = 'content.numbers.length';
    predicate.value = 2;
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(0);

    predicate.value = 3;
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(1);

    predicate.operator = '<';
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(0);

    predicate.operator = '<=';
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(1);

    predicate.operator = '>';
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(0);

    predicate.keypath = 'updated_at';
    predicate.operator = '>';
    const date = new Date();
    date.setSeconds(date.getSeconds() + 1);
    predicate.value = date;
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(0);

    predicate.operator = '<';
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(itemManager.items.length);

    predicate.keypath = 'updated_at';
    predicate.operator = '<';
    predicate.value = '30.days.ago';
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(0);
    predicate.operator = '>';
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(1);

    predicate.value = '1.hours.ago';
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(1);

    // multi matching
    expect(
      itemManager.itemsMatchingPredicates([
        new SNPredicate('content_type', '=', 'Item'),
        new SNPredicate('content.title', '=', 'SHello'),
      ]).length
    ).toBe(0);

    expect(
      itemManager.itemsMatchingPredicates([
        new SNPredicate('content_type', '=', 'Item'),
        new SNPredicate('content.title', '=', 'Hello'),
      ]).length
    ).toBe(1);

    expect(
      itemManager.itemsMatchingPredicate(
        new SNPredicate('content.title', 'startsWith', 'H')
      ).length
    ).toBe(1);
  });

  it('item manager predicate matching 2', async function () {
    const payload = CreateMaxPayloadFromAnyObject({
      uuid: Factory.generateUuidish(),
      content_type: 'Item',
      content: {
        tags: [
          {
            title: 'sobar',
            id: Math.random(),
          },
          {
            title: 'foobart',
            id: Math.random(),
          },
        ],
      },
    });

    const item2 = await itemManager.emitItemFromPayload(
      payload,
      PayloadSource.LocalChanged
    );

    expect(
      itemManager.itemsMatchingPredicate(
        new SNPredicate('content.tags', 'includes', [
          'title',
          'includes',
          'bar',
        ])
      ).length
    ).toBe(1);
    expect(
      itemManager.itemsMatchingPredicate(
        new SNPredicate('content.tags', 'includes', ['title', 'in', ['sobar']])
      ).length
    ).toBe(1);
    expect(
      itemManager.itemsMatchingPredicate(
        new SNPredicate('content.tags', 'includes', [
          'title',
          'in',
          ['sobar', 'foo'],
        ])
      ).length
    ).toBe(1);
    expect(
      itemManager.itemsMatchingPredicate(
        new SNPredicate(
          'content.tags',
          'includes',
          new SNPredicate('title', 'startsWith', 'f')
        )
      ).length
    ).toBe(1);
    expect(
      itemManager.itemsMatchingPredicate(new SNPredicate('archived', '=', true))
        .length
    ).toBe(0);
    const contentPred = new SNPredicate('content_type', '=', 'Item');

    await itemManager.changeItem(item2.uuid, (mutator) => {
      mutator.archived = true;
    });

    expect(
      itemManager.itemsMatchingPredicates([
        contentPred,
        new SNPredicate('archived', '=', true),
      ]).length
    ).toBe(1);
  });

  it('nonexistent property should not satisfy predicate', async function () {
    const item = await createItem();
    expect(
      item.satisfiesPredicate(new SNPredicate('content.foobar.length', '=', 0))
    ).toBe(false);
  });

  it('false should compare true with undefined', async function () {
    const item = await createItem();
    await itemManager.emitItemFromPayload(
      item.payloadRepresentation(),
      PayloadSource.LocalSaved
    );
    const predicate = new SNPredicate('pinned', '=', false);
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(itemManager.items.length);
  });

  it('regex', async function () {
    const item = await createItem();
    const changedItem = await itemManager.changeItem(
      item.uuid,
      (mutator) => {
        mutator.content.title = '123';
      }
    );

    // match only letters
    const predicate = new SNPredicate(
      'content.title',
      'matches',
      '^[a-zA-Z]+$'
    );
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(0);

    await itemManager.changeItem(changedItem.uuid, (mutator) => {
      mutator.content.title = 'abc';
    });
    expect(itemManager.itemsMatchingPredicate(predicate).length).toBe(1);
  });
});
