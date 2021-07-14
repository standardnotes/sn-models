import { PurePayload } from '@Lib/index';
import { ContentType, SNItem, SNTag } from '@Lib/models';
import * as Factory from '../factory';

describe('item', () => {
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

  const createBarePayload = () => {
    return new PurePayload({
      uuid: '123',
      content_type: ContentType.Note,
      content: {
        title: 'hello',
      },
    });
  };

  it('constructing without uuid should throw', function () {
    const payload = new PurePayload({});

    const throwFn = () => {
      const item = new SNItem(payload);
      item;
    };
    expect(throwFn).toThrowError();
  });

  it('healthy constructor', function () {
    const item = createNote();

    expect(item).toBeTruthy();
    expect(item.payload).toBeTruthy();
  });

  it('user modified date should be ok', function () {
    const item = createNote();

    expect(item.userModifiedDate).toBeTruthy();
  });

  it('has relationship with item true', function () {
    const note = createNote();
    const tag = createTag();

    expect(tag.hasRelationshipWithItem(note)).toBe(false);
  });

  it('has relationship with item true', function () {
    const note = createNote();
    const tag = createTag([note]);

    expect(tag.hasRelationshipWithItem(note)).toBe(true);
  });

  it('getDomainData for random domain should return undefined', function () {
    const note = createNote();

    expect(note.getDomainData('random')).toBeFalsy();
  });

  it('getDomainData for app domain should return object', function () {
    const note = createNote();

    expect(note.getDomainData(SNItem.DefaultAppDomain())).toBeTruthy();
  });
});
