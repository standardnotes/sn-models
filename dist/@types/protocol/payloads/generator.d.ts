import { PurePayload } from './pure_payload';
import { PayloadSource } from './sources';
import { ContentType } from '../../models/content_types';
import { EncryptionIntent } from '../intents';
import { PayloadField } from './fields';
export declare type ContentReference = {
    uuid: string;
    content_type: string;
};
export declare type PayloadContent = {
    [key: string]: any;
    references: ContentReference[];
};
export declare type PayloadOverride = {
    [key in PayloadField]?: any;
} | PurePayload;
export declare type RawPayload = {
    uuid: string;
    content_type: ContentType;
    content?: PayloadContent | string;
    deleted?: boolean;
    items_key_id?: string;
    enc_item_key?: string;
    created_at?: Date;
    updated_at?: Date;
    dirtiedDate?: Date;
    dirty?: boolean;
    errorDecrypting?: boolean;
    waitingForKey?: boolean;
    errorDecryptingValueChanged?: boolean;
    lastSyncBegan?: Date;
    lastSyncEnd?: Date;
    auth_hash?: string;
    auth_params?: any;
    duplicate_of?: string;
};
export declare type RawEncryptionParameters = {
    uuid?: string;
    content?: PayloadContent | string;
    items_key_id?: string;
    enc_item_key?: string;
    errorDecrypting?: boolean;
    waitingForKey?: boolean;
    errorDecryptingValueChanged?: boolean;
    auth_hash?: string;
    auth_params?: any;
};
export declare function CreateMaxPayloadFromAnyObject(object: RawPayload, override?: PayloadOverride, source?: PayloadSource): PurePayload;
/**
 * Makes a new payload by starting with input payload, then overriding values of all
 * keys of mergeWith.fields. If wanting to merge only specific fields, pass an array of
 * fields. If override value is passed, values in here take final precedence, including
 * above both payload and mergeWith values.
 */
export declare function PayloadByMerging(payload: PurePayload, mergeWith: PurePayload, fields?: PayloadField[], override?: PayloadOverride): PurePayload;
export declare function CreateIntentPayloadFromObject(object: RawPayload, intent: EncryptionIntent, override?: PayloadOverride): PurePayload;
export declare function CreateSourcedPayloadFromObject(object: RawPayload, source: PayloadSource, override?: PayloadOverride): PurePayload;
export declare function CopyPayload(payload: PurePayload, override?: PayloadOverride): PurePayload;
export declare function CreateEncryptionParameters(raw: RawEncryptionParameters, source?: PayloadSource): PurePayload;
export declare function CopyEncryptionParameters(raw: RawEncryptionParameters, override?: PayloadOverride): PurePayload;
export declare function payloadFieldsForSource(source: PayloadSource): PayloadField[];
