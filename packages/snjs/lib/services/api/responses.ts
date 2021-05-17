import { RawPayload } from '@Payloads/generator';
import { ApiEndpointParam } from './keys';
import {
  AnyKeyParamsContent,
  KeyParamsOrigination,
} from './../../protocol/key_params';
import { ProtocolVersion } from './../../protocol/versions';
import { Role, Permission } from '@standardnotes/auth';

export enum StatusCode {
  LocalValidationError = 10,
  CanceledMfa = 11,
  UnknownError = 12,

  HttpStatusMinSuccess = 200,
  HttpStatusNoContent = 204,
  HttpStatusMaxSuccess = 299,
  /** The session's access token is expired, but the refresh token is valid */
  HttpStatusExpiredAccessToken = 498,
  /** The session's access token and refresh token are expired, user must reauthenticate */
  HttpStatusInvalidSession = 401,
  /** User's IP is rate-limited. */
  HttpStatusForbidden = 403,
}

export type HttpResponse<T = unknown> = {
  status: StatusCode;
  error?: HttpResponseError;
  data?: T;
  meta?: ResponseMeta;
};

export type HttpResponseError = {
  message: string;
  status: number;
  tag?: string;
  wrappedError?: HttpResponseError;
};

export type ResponseMeta = {
  auth: {
    role: Role;
    permissions: Permission[];
  };
};

export function isErrorResponseExpiredToken(errorResponse: HttpResponse) {
  return errorResponse.status === StatusCode.HttpStatusExpiredAccessToken;
}

type SessionBody = {
  access_token: string;
  refresh_token: string;
  access_expiration: number;
  refresh_expiration: number;
};

export type KeyParamsResponse = HttpResponse & {
  identifier?: string;
  pw_cost?: number;
  pw_nonce?: string;
  version?: ProtocolVersion;
  /** Legacy V002 */
  pw_salt?: string;
  /** Legacy V001 */
  pw_func?: string;
  pw_alg?: string;
  pw_key_size?: number;
  origination?: KeyParamsOrigination;
  created?: string;
};

export type User = {
  uuid: string;
  email: string;
};

export type RegistrationResponse = HttpResponse & {
  session?: SessionBody;
  /** Represents legacy JWT token */
  token?: string;
  user?: User;
};

export type SignInResponse = RegistrationResponse & {
  key_params?: AnyKeyParamsContent;
};

export type ChangePasswordResponse = SignInResponse;

export type SignOutResponse = HttpResponse & Record<string, unknown>;

export type SessionRenewalResponse = HttpResponse & {
  session?: SessionBody;
};

export type SessionListEntry = {
  uuid: string;
  api_version: string;
  created_at: string;
  updated_at: string;
  device_info: string;
};

export type RevisionListEntry = {
  content_type: string;
  created_at: string;
  updated_at: string;
  /** The uuid of the revision */
  uuid: string;
};

export type RevisionListResponse = HttpResponse & RevisionListEntry[];

export type SingleRevision = {
  auth_hash?: string;
  content_type: string;
  content: string;
  created_at: string;
  enc_item_key: string;
  /** The uuid of the item this revision was created with */
  item_uuid: string;
  items_key_id: string;
  updated_at: string;
  /** The uuid of the revision */
  uuid: string;
};

export type SingleRevisionResponse = HttpResponse & Partial<SingleRevision>;

export enum ConflictType {
  ConflictingData = 'sync_conflict',
  UuidConflict = 'uuid_conflict',
}

export type ConflictParams = {
  type: ConflictType;
  server_item?: RawPayload;
  unsaved_item?: RawPayload;
  /** @legacay */
  item?: RawPayload;
};

export type RawSyncResponse = {
  error?: any;
  [ApiEndpointParam.LastSyncToken]?: string;
  [ApiEndpointParam.PaginationToken]?: string;
  [ApiEndpointParam.IntegrityResult]?: string;
  retrieved_items?: RawPayload[];
  saved_items?: RawPayload[];
  conflicts?: ConflictParams[];
  unsaved?: ConflictParams[];
  status?: number;
};
