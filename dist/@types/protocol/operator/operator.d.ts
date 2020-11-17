import { RootKeyEncryptedAuthenticatedData, ItemAuthenticatedData, LegacyAttachedData } from './../payloads/generator';
import { SNRootKey } from './../root_key';
import { SNRootKeyParams, KeyParamsOrigination } from './../key_params';
import { PurePayload } from './../payloads/pure_payload';
import { SNItemsKey } from '../../models/app/items_key';
import { PayloadFormat } from '../payloads/formats';
import { ProtocolVersion } from '../versions';
import { SNPureCrypto } from '@standardnotes/sncrypto';
export declare type ItemsKeyContent = {
    itemsKey: string;
    dataAuthenticationKey?: string;
    version: ProtocolVersion;
};
/**w
 * An operator is responsible for performing crypto operations, such as generating keys
 * and encrypting/decrypting payloads. Operators interact directly with
 * platform dependent SNPureCrypto implementation to directly access cryptographic primitives.
 * Each operator is versioned according to the protocol version. Functions that are common
 * across all versions appear in this generic parent class.
 */
export declare abstract class SNProtocolOperator {
    protected readonly crypto: SNPureCrypto;
    constructor(crypto: SNPureCrypto);
    /**
     * Returns encryption protocol display name
     */
    abstract getEncryptionDisplayName(): string;
    /**
     * Computes a root key given a password and previous keyParams
     * @param password - Plain string representing raw user password
     */
    abstract computeRootKey(password: string, keyParams: SNRootKeyParams): Promise<SNRootKey>;
    /**
     * Creates a new root key given an identifier and a user password
     * @param identifier - Plain string representing a unique identifier
     *    for the user
     * @param password - Plain string representing raw user password
     */
    abstract createRootKey(identifier: string, password: string, origination: KeyParamsOrigination): Promise<SNRootKey>;
    /**
     * Returns the payload's authenticated data. The passed payload must be in a
     * non-decrypted, ciphertext state.
     */
    abstract getPayloadAuthenticatedData(payload: PurePayload): Promise<RootKeyEncryptedAuthenticatedData | ItemAuthenticatedData | LegacyAttachedData | undefined>;
    protected abstract generateNewItemsKeyContent(): Promise<ItemsKeyContent>;
    protected firstHalfOfKey(key: string): Promise<string>;
    protected secondHalfOfKey(key: string): Promise<string>;
    protected splitKey(key: string, parts: number): string[];
    /**
     * Creates a new random SNItemsKey to use for item encryption.
     * The consumer must save/sync this item.
     */
    createItemsKey(): Promise<SNItemsKey>;
    /**
    * Converts a bare payload into an encrypted one in the desired format.
    * @param payload - The non-encrypted payload object to encrypt
    * @param key - The key to use to encrypt the payload. Can be either
    *  a RootKey (when encrypting payloads that require root key encryption, such as encrypting
    * items keys), or an ItemsKey (if encrypted regular items)
    * @param format - The desired result format
    */
    generateEncryptedParameters(payload: PurePayload, format: PayloadFormat, _key?: SNItemsKey | SNRootKey): Promise<PurePayload>;
    /**
    * Converts encrypted parameters (a subset of a Payload) into decrypted counterpart.
    * @param encryptedParameters - The encrypted payload object to decrypt
    * @param key - The key to use to decrypt the payload. Can be either
    *  a RootKey (when encrypting payloads that require root key encryption, such as encrypting
    * items keys), or an ItemsKey (if encrypted regular items)
    */
    generateDecryptedParameters(encryptedParameters: PurePayload, _key?: SNItemsKey | SNRootKey): Promise<PurePayload>;
}
