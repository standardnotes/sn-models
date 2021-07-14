import {
  Base64String,
  HexString,
  SNPureCrypto,
  timingSafeEqual,
  Utf8String,
} from '@standardnotes/sncrypto-common';
import { v4 as uuidv4 } from 'uuid';

const CryptoJS = require('crypto-js');
const sodium = require('libsodium-wrappers');
const NodeCrypto = require('crypto');

/**
 * An SNPureCrypto implementation. Required to create a new SNApplication instance.
 */
export default class SNCrypto implements SNPureCrypto {
  private ready: Promise<void> | null;

  constructor() {
    this.ready = sodium.ready;
  }

  public deinit() {
    this.ready = null;
  }

  public timingSafeEqual(a: string, b: string) {
    return timingSafeEqual(a, b);
  }

  public async pbkdf2(
    password: Utf8String,
    salt: Utf8String,
    iterations: number,
    length: number
  ): Promise<HexString | null> {
    const key = NodeCrypto.pbkdf2Sync(password, salt, iterations, length, 'sha512');
    return key.toString("hex");
  }

  public async generateRandomKey(bits: number): Promise<string> {
    await this.ready;
    const bytes = bits / 8;
    return sodium.randombytes_buf(bytes, "hex");
  }

  public async aes256CbcEncrypt(
    plaintext: Utf8String,
    iv: HexString,
    key: HexString
  ): Promise<Base64String> {
    key = CryptoJS.enc.Hex.parse(key);
    const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
      iv: CryptoJS.enc.Hex.parse(iv)
    });
    return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  }

  public async aes256CbcDecrypt(
    ciphertext: Base64String,
    iv: HexString,
    key: HexString
  ): Promise<Utf8String | null> {
    try {
      key = CryptoJS.enc.Hex.parse(key);
      const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
        iv: CryptoJS.enc.Hex.parse(iv)
      });
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      return null;
    }
  }

  public async hmac256(
    message: Utf8String,
    key: HexString
  ): Promise<HexString | null> {
    try {
      const encrypted = CryptoJS.HmacSHA256(message, key);
      return encrypted.toString(CryptoJS.enc.Hex);
    } catch (e) {
      return null;
    }
  }

  public async sha256(text: string): Promise<string> {
    const result = CryptoJS.SHA256(sodium.to_hex(text));
    return result.toString(CryptoJS.enc.Hex);
  }

  public async unsafeSha1(text: string): Promise<string> {
    const result = CryptoJS.SHA1(sodium.to_hex(text));
    return result.toString(CryptoJS.enc.Hex);
  }

  public async argon2(
    password: Utf8String,
    salt: string,
    iterations: number,
    bytes: number,
    length: number
  ): Promise<HexString> {
    await this.ready;
    return sodium.crypto_pwhash(
      length,
      sodium.from_string(password),
      sodium.from_hex(salt),
      iterations,
      bytes,
      sodium.crypto_pwhash_ALG_DEFAULT,
      'hex'
    );
  }

  public async xchacha20Encrypt(
    plaintext: Utf8String,
    nonce: HexString,
    key: HexString,
    assocData: Utf8String
  ): Promise<Base64String> {
    await this.ready;
    try {
      return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        plaintext,
        assocData,
        null,
        sodium.from_hex(nonce),
        sodium.from_hex(key),
        'base64'
      );
    } catch (e) {
      return "";
    }
  }

  public async xchacha20Decrypt(
    ciphertext: Base64String,
    nonce: HexString,
    key: HexString,
    assocData: Utf8String
  ): Promise<string | null> {
    await this.ready;
    try {
      return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        sodium.from_base64(ciphertext),
        assocData,
        sodium.from_hex(nonce),
        sodium.from_hex(key),
        'text'
      );
    } catch (e) {
      return null;
    }
  }

  public generateUUIDSync() {
    return uuidv4();
  }

  public async generateUUID() {
    return uuidv4();
  }

  public async base64Encode(text: Utf8String): Promise<string> {
    return btoa(text);
  }

  public async base64Decode(base64String: Base64String): Promise<string> {
    return atob(base64String);
  }
}
