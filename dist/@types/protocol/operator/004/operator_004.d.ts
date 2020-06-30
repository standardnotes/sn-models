import { SNItemsKey } from '../../../models/app/items_key';
import { PurePayload } from './../../payloads/pure_payload';
import { SNRootKeyParams } from './../../key_params';
import { ItemsKeyContent } from './../operator';
import { SNProtocolOperator003 } from '../003/operator_003';
import { PayloadFormat } from '../../payloads/formats';
import { ProtocolVersion } from '../../versions';
import { SNRootKey } from '../../root_key';
export declare class SNProtocolOperator004 extends SNProtocolOperator003 {
    getEncryptionDisplayName(): string;
    get version(): ProtocolVersion;
    protected generateNewItemsKeyContent(): Promise<ItemsKeyContent>;
    /**
     * We require both a client-side component and a server-side component in generating a
     * salt. This way, a comprimised server cannot benefit from sending the same seed value
     * for every user. We mix a client-controlled value that is globally unique
     * (their identifier), with a server controlled value to produce a salt for our KDF.
     * @param identifier
     * @param seed
    */
    private generateSalt004;
    /**
     * Computes a root key given a password and previous keyParams
     * @param password - Plain string representing raw user password
     * @param keyParams - KeyParams object
     */
    computeRootKey(password: string, keyParams: SNRootKeyParams): Promise<SNRootKey>;
    /**
     * Creates a new root key given an identifier and a user password
     * @param identifier - Plain string representing a unique identifier
     * @param password - Plain string representing raw user password
     */
    createRootKey(identifier: string, password: string): Promise<{
        key: SNRootKey;
        keyParams: SNRootKeyParams;
    }>;
    /**
     * @param plaintext - The plaintext to encrypt.
     * @param rawKey - The key to use to encrypt the plaintext.
     * @param nonce - The nonce for encryption.
     * @param aad - JavaScript object (will be stringified) representing
                  'Additional authenticated data': data you want to be included in authentication.
     */
    private encryptString004;
    /**
     * @param {string} ciphertext  The encrypted text to decrypt.
     * @param {string} rawKey  The key to use to decrypt the ciphertext.
     * @param {string} nonce  The nonce for decryption.
     * @param {object} aad  JavaScript object (will be stringified) representing
                  'Additional authenticated data' - data you want to be included in authentication.
     */
    private decryptString004;
    /**
     * @param plaintext  The plaintext text to decrypt.
     * @param rawKey  The key to use to encrypt the plaintext.
     * @param itemUuid  The uuid of the item being encrypted
     */
    private generateEncryptedProtocolString;
    generateEncryptedParameters(payload: PurePayload, format: PayloadFormat, key?: SNItemsKey | SNRootKey): Promise<PurePayload>;
    generateDecryptedParameters(encryptedParameters: PurePayload, key?: SNItemsKey | SNRootKey): Promise<PurePayload>;
    private deconstructEncryptedPayloadString;
    protected deriveKey(password: string, salt: string, iterations: number): Promise<SNRootKey>;
}
