import { PurePayload, MutationType } from '@Lib/index';
import { ContentType, SNItem, SNTag, ItemMutator, CreateItemFromPayload } from '@Lib/models';
import * as Factory from '../factory';

describe('mutator', () => {
  const createBarePayload = () => {
    return new PurePayload({
      uuid: '123',
      content_type: ContentType.Note,
      content: {
        title: 'hello',
      },
    });
  };

  const createNote = () => {
    return new SNItem(createBarePayload());
  };

  const createTag = (notes = []) => {
    const references = notes.map((note) => {
      return {
        uuid: note.uuid,
        content_type: note.content_type,
      };
    });
    return new SNTag(
      new PurePayload({
        uuid: Factory.generateUuidish(),
        content_type: ContentType.Tag,
        content: {
          title: 'thoughts',
          references: references,
        },
      })
    );
  };

  it('mutate set domain data key', function () {
    const item = createNote();
    const mutator = new ItemMutator(item);
    mutator.setDomainDataKey('somekey', 'somevalue', 'somedomain');
    const payload = mutator.getResult();

    expect(payload.content.appData.somedomain.somekey).toBe('somevalue');
  });

  it('mutate set pinned', function () {
    const item = createNote();
    const mutator = new ItemMutator(item);
    mutator.pinned = true;
    const payload = mutator.getResult();

    expect(payload.content.appData[SNItem.DefaultAppDomain()].pinned).toBe(true);
  });

  it('mutate set archived', function () {
    const item = createNote();
    const mutator = new ItemMutator(item);
    mutator.archived = true;
    const payload = mutator.getResult();

    expect(
      payload.content.appData[SNItem.DefaultAppDomain()].archived
    ).toBe(true);
  });

  it('mutate set locked', function () {
    const item = createNote();
    const mutator = new ItemMutator(item);
    mutator.locked = true;
    const payload = mutator.getResult();

    expect(payload.content.appData[SNItem.DefaultAppDomain()].locked).toBe(true);
  });

  it('mutate set protected', function () {
    const item = createNote();
    const mutator = new ItemMutator(item);
    mutator.protected = true;
    const payload = mutator.getResult();

    expect(payload.content.protected).toBe(true);
  });

  it('mutate set trashed', function () {
    const item = createNote();
    const mutator = new ItemMutator(item);
    mutator.trashed = true;
    const payload = mutator.getResult();

    expect(payload.content.trashed).toBe(true);
  });

  it('calling get result should set us dirty', function () {
    const item = createNote();
    const mutator = new ItemMutator(item);
    const payload = mutator.getResult();

    expect(payload.dirty).toBe(true);
  });

  it('get result should always have userModifiedDate', function () {
    const item = createNote();
    const mutator = new ItemMutator(item);
    const payload = mutator.getResult();
    const resultItem = CreateItemFromPayload(payload);
    expect(resultItem.userModifiedDate).toBeTruthy();
  });

  it('mutate set deleted', function () {
    const item = createNote();
    const mutator = new ItemMutator(item);
    mutator.setDeleted();
    const payload = mutator.getResult();

    expect(payload.content).toBeFalsy();
    expect(payload.deleted).toBe(true);
    expect(payload.dirty).toBe(true);
  });

  it('mutate app data', function () {
    const item = createNote();
    const mutator = new ItemMutator(item, MutationType.UserInteraction);
    mutator.setAppDataItem('foo', 'bar');
    mutator.setAppDataItem('bar', 'foo');
    const payload = mutator.getResult();
    expect(payload.content.appData[SNItem.DefaultAppDomain()].foo).toBe('bar');
    expect(payload.content.appData[SNItem.DefaultAppDomain()].bar).toBe('foo');
  });

  it('mutate add item as relationship', function () {
    const note = createNote();
    const tag = createTag();
    const mutator = new ItemMutator(tag);
    mutator.addItemAsRelationship(note);
    const payload = mutator.getResult();

    const item = new SNItem(payload);
    expect(item.hasRelationshipWithItem(note)).toBe(true);
  });

  it('mutate remove item as relationship', function () {
    const note = createNote();
    const tag = createTag([note]);
    const mutator = new ItemMutator(tag);
    mutator.removeItemAsRelationship(note);
    const payload = mutator.getResult();

    const item = new SNItem(payload);
    expect(item.hasRelationshipWithItem(note)).toBe(false);
  });
});
