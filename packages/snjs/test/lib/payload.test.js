import {
  PurePayload,
  PayloadField,
  PayloadSource,
  PayloadFormat,
  PayloadByMerging,
  CreateIntentPayloadFromObject,
  CreateEncryptionParameters
} from "@Lib/index";
import { ContentType } from "@Lib/models";
import { EncryptionIntent } from "@Lib/protocol";

describe('payload', () => {
  const createBarePayload = () => {
    return new PurePayload({
      uuid: '123',
      content_type: ContentType.Note,
      content: {
        title: 'hello',
      },
    });
  };

  const createEncryptedPayload = () => {
    return new PurePayload({
      uuid: '123',
      content_type: ContentType.Note,
      content: '004:foo:bar',
    });
  };

  it('constructor should set expected fields', function () {
    const payload = createBarePayload();

    expect(payload.uuid).toBeTruthy();
    expect(payload.content_type).toBeTruthy();
    expect(payload.content).toBeTruthy();
  });

  it('not supplying fields should infer them', function () {
    const payload = new PurePayload({
      uuid: '123',
      content_type: ContentType.Note,
      content: {
        title: 'hello',
      },
    });

    const expectedFields = [
      PayloadField.Uuid,
      PayloadField.ContentType,
      PayloadField.Content,
    ];

    expect(payload.fields).toEqual(expectedFields);
  });

  it('not supplying source should default to constructor source', function () {
    const payload = new PurePayload({
      uuid: '123',
      content_type: ContentType.Note,
      content: {
        title: 'hello',
      },
    });

    expect(payload.source).toBe(PayloadSource.Constructor);
  });

  it('created at should default to present', function () {
    const payload = createBarePayload();

    expect(payload.created_at - new Date()).toBeLessThan(1);
  });

  it('updated at should default to epoch', function () {
    const payload = createBarePayload();

    expect(payload.updated_at.getTime()).toBe(0);
  });

  it('payload format bare', function () {
    const payload = createBarePayload();

    expect(payload.format).toBe(PayloadFormat.DecryptedBareObject);
  });

  it('payload format encrypted string', function () {
    const payload = createEncryptedPayload();

    expect(payload.format).toBe(PayloadFormat.EncryptedString);
  });

  it('payload format base64 string', function () {
    const payload = new PurePayload({
      uuid: '123',
      content_type: ContentType.Note,
      content: '000:somebase64string',
    });

    expect(payload.format).toBe(PayloadFormat.DecryptedBase64String);
  });

  it('payload format deleted', function () {
    const payload = new PurePayload({
      uuid: '123',
      content_type: ContentType.Note,
      deleted: true,
    });

    expect(payload.format).toBe(PayloadFormat.Deleted);
  });

  it('payload version 004', function () {
    const payload = createEncryptedPayload();

    expect(payload.version).toBe('004');
  });

  it('merged with absent content', function () {
    const payload = createBarePayload();
    const otherPayload = new PurePayload({
      uuid: '123',
      content_type: ContentType.Note,
      updated_at: new Date(),
      dirty: true,
      dirtiedDate: new Date(),
    });
    const merged = PayloadByMerging(payload, otherPayload);

    expect(merged.content).toEqual(payload.content);
    expect(merged.uuid).toBe(payload.uuid);
    expect(merged.dirty).toBe(true);
    expect(merged.updated_at.getTime()).toBeGreaterThan(1);
  });

  it('merged with undefined content', function () {
    const payload = createBarePayload();
    const otherPayload = new PurePayload({
      content: undefined,
    });
    const merged = PayloadByMerging(payload, otherPayload);

    expect(merged.uuid).toBe(payload.uuid);
    expect(merged.content).toBeFalsy();
  });

  it('deleted and not dirty should be discardable', function () {
    const payload = new PurePayload({
      uuid: '123',
      content_type: ContentType.Note,
      deleted: true,
      dirty: false,
    });

    expect(payload.discardable).toBe(true);
  });

  it('should be immutable', function () {
    const payload = createBarePayload();

    const changeFn = () => {
      payload.foo = 'bar';
    };
    expect(changeFn).toThrowError();
  });

  it('CreateIntentPayloadFromObject', function () {
    const payload = createBarePayload();
    const override = new PurePayload(
      {
        content: '004:...',
      },
      [PayloadField.Content]
    );
    const intentPayload = CreateIntentPayloadFromObject(
      payload,
      EncryptionIntent.LocalStoragePreferEncrypted,
      override
    );

    expect(intentPayload.content_type).toBeTruthy();
  });

  it('Encryption params with override of select fields should only merge provided fields', function () {
    const payload = createBarePayload();
    const override = CreateEncryptionParameters({
      waitingForKey: true,
      errorDecrypting: true,
    });
    const intentPayload = CreateIntentPayloadFromObject(
      payload,
      EncryptionIntent.LocalStoragePreferEncrypted,
      override
    );

    expect(intentPayload.uuid).toBeTruthy();
    expect(intentPayload.content).toBeTruthy();
    expect(intentPayload.content_type).toBeTruthy();
  });
});
