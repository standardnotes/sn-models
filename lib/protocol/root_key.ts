import { PurePayload } from './payloads/pure_payload';
import { AnyKeyParamsContent, SNRootKeyParams } from './key_params';
import { FillItemContent } from '@Models/functions';
import { CreateMaxPayloadFromAnyObject } from '@Payloads/generator';
import { SNItem } from '@Models/core/item';
import { ContentType } from '@Models/content_types';
import { ProtocolVersion } from '@Protocol/versions';
import { Uuid } from '@Lib/uuid';
import { timingSafeEqual } from '@standardnotes/sncrypto';

export type RootKeyContent = {
  version: ProtocolVersion;
  masterKey: string;
  serverPassword?: string;
  dataAuthenticationKey?: string;
  keyParams: AnyKeyParamsContent
}

/**
 * A root key is a local only construct that houses the key used for the encryption
 * and decryption of items keys. A root key extends SNItem for local convenience, but is
 * not part of the syncing or storage ecosystem—root keys are managed independently.
 */
export class SNRootKey extends SNItem {

  public readonly keyParams: SNRootKeyParams

  static async Create(content: RootKeyContent, uuid?: string) {
    if (!uuid) {
      uuid = await Uuid.GenerateUuid();
    }
    if (!content.version) {
      if (content.dataAuthenticationKey) {
        /**
         * If there's no version stored, it must be either 001 or 002.
         * If there's a dataAuthenticationKey, it has to be 002. Otherwise it's 001.
         */
        content.version = ProtocolVersion.V002;
      } else {
        content.version = ProtocolVersion.V001;
      }
    }
    const payload = CreateMaxPayloadFromAnyObject(
      {
        uuid: uuid,
        content_type: ContentType.RootKey,
        content: FillItemContent(content)
      }
    )
    const keyParamsInput = content.keyParams;
    if (!keyParamsInput) {
      throw Error('Attempting to create root key without key params');
    }
    const keyParams = keyParamsInput instanceof SNRootKeyParams
      ? keyParamsInput
      : new SNRootKeyParams(keyParamsInput);

    return new SNRootKey(payload, keyParams);
  }

  /**
   * Given a root key, expands its key params by making a copy which includes
   * the inputted key params. Used to expand locally created key params after signing in
   */
  static async ExpandedCopy(key: SNRootKey, keyParams?: AnyKeyParamsContent) {
    const content = key.typedContent as RootKeyContent;
    const copiedKey = await this.Create({
      ...content,
      keyParams: keyParams ? keyParams : content.keyParams
    })
    return copiedKey;
  }

  constructor(payload: PurePayload, keyParams: SNRootKeyParams) {
    super(payload);
    this.keyParams = keyParams;
  }

  private get typedContent() {
    return this.safeContent as Partial<RootKeyContent>;
  }

  public get keyVersion() {
    if (!this.payload.safeContent.version) {
      throw 'Attempting to create key without version.';
    }
    return this.payload.safeContent.version;
  }

  public get isRootKey() {
    return true;
  }

  /**
   * When the root key is used to encrypt items, we use the masterKey directly.
   */
  public get itemsKey() {
    return this.masterKey;
  }

  public get masterKey() {
    return this.payload.safeContent.masterKey;
  }

  /**
   * serverPassword is not persisted as part of keychainValue, so if loaded from disk,
   * this value may be undefined.
   */
  public get serverPassword(): string | undefined {
    return this.payload.safeContent.serverPassword;
  }

  /** 003 and below only. */
  public get dataAuthenticationKey() {
    return this.payload.safeContent.dataAuthenticationKey;
  }

  /**
   * Compares two keys for equality
   */
  public compare(otherKey: SNRootKey) {
    if (this.keyVersion !== otherKey.keyVersion) {
      return false;
    }
    const hasServerPassword = !!(this.serverPassword && otherKey.serverPassword);
    return (
      timingSafeEqual(this.masterKey, otherKey.masterKey) &&
      (!hasServerPassword || timingSafeEqual(this.serverPassword!, otherKey.serverPassword!))
    );
  }

  /**
   * @returns Object suitable for persist in storage when wrapped
   */
  public persistableValueWhenWrapping() {
    const keychainValue = this.getKeychainValue();
    keychainValue.keyParams = this.keyParams.getPortableValue();
    return keychainValue;
  }

  /**
 * @returns Object that is suitable for persisting in a keychain
 */
  public getKeychainValue() {
    const values: Partial<RootKeyContent> = {
      version: this.keyVersion
    };
    if (this.masterKey) {
      values.masterKey = this.masterKey;
    }
    if (this.dataAuthenticationKey) {
      values.dataAuthenticationKey = this.dataAuthenticationKey;
    }
    return values;
  }
}
