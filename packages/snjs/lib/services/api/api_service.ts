import { UuidString } from './../../types';
import {
  ChangePasswordResponse,
  HttpResponse,
  RegistrationResponse,
  RevisionListEntry,
  RevisionListResponse,
  SessionRenewalResponse,
  SignInResponse,
  SignOutResponse,
  SingleRevisionResponse,
  StatusCode,
  isErrorResponseExpiredToken,
  ResponseMeta,
  KeyParamsResponse,
} from './responses';
import { RemoteSession, Session, TokenSession } from './session';
import { ContentType } from '@Models/content_types';
import { PurePayload } from '@Payloads/pure_payload';
import { SNRootKeyParams } from './../../protocol/key_params';
import { SNStorageService } from './../storage_service';
import {
  HttpParams,
  HttpRequest,
  HttpVerb,
  SNHttpService,
} from './http_service';
import merge from 'lodash/merge';
import { ApiEndpointParam } from '@Services/api/keys';
import * as messages from '@Services/api/messages';
import { PureService } from '@Services/pure_service';
import { joinPaths } from '@Lib/utils';
import { StorageKey } from '@Lib/storage_keys';
import { SNPermissionsService } from '../permissions_service';
import { GetAuthMethodsResponse, MfaStatus, SNMfaService } from './mfa_service';
import { SNAlertService } from '@Lib/index';
import { ErrorTag } from '@standardnotes/auth';
import { Uuid, MfaSetting } from '@standardnotes/auth';

type PathsV0 = {
  keyParams: string;
  register: string;
  signIn: string;
  changePassword: string;
  sync: string;
  signOut: string;
  refreshSession: string;
  sessions: string;
  session: string;
  itemRevisions: (itemId: string) => string;
  itemRevision: (itemId: string, revisionId: string) => string;
};

type PathsV1 = {
  authMethods: string;
  keyParams: string;
  register: string;
  signIn: string;
  signOut: string;
  putSetting: (userUuid: Uuid) => string;
  deleteSetting: ({
    userUuid,
    settingName,
  }: {
    userUuid: Uuid;
    settingName: string;
  }) => string;
};

type DeleteSettingDto = {
  userUuid: Uuid;
  settingName: string;
};

const Paths: {
  v0: PathsV0;
  v1: PathsV1;
} = {
  v0: {
    keyParams: '/auth/params',
    register: '/auth',
    signIn: '/auth/sign_in',
    changePassword: '/auth/change_pw',
    sync: '/items/sync',
    signOut: '/auth/sign_out',
    refreshSession: '/session/refresh',
    sessions: '/sessions',
    session: '/session',
    itemRevisions: (itemId: string) => `/items/${itemId}/revisions`,
    itemRevision: (itemId: string, revisionId: string) =>
      `/items/${itemId}/revisions/${revisionId}`,
  },
  v1: {
    authMethods: '/v1/auth/methods',
    keyParams: '/v1/login-params',
    register: '/v1/users',
    signIn: '/v1/login',
    signOut: '/v1/logout',
    putSetting: (userUuid: Uuid) => `/v1/users/${userUuid}/settings`,
    deleteSetting: ({ userUuid, settingName }: DeleteSettingDto) =>
      `/v1/users/${userUuid}/settings/${settingName}`,
  },
};

/** Legacy api version field to be specified in params when calling v0 APIs. */
const V0_API_VERSION = '20200115';

type InvalidSessionObserver = (revoked: boolean) => void;

type HttpRequestWithFallbackError = HttpRequest & {
  fallbackErrorMessage: string;
};

export class SNApiService extends PureService {
  private session?: Session;

  private registering = false;
  private authenticating = false;
  private changing = false;
  private refreshingSession = false;

  private invalidSessionObserver?: InvalidSessionObserver;

  constructor(
    private httpService: SNHttpService,
    private storageService: SNStorageService,
    private permissionsService: SNPermissionsService,
    private host: string,
    private mfaService: SNMfaService,
    private alertService: SNAlertService
  ) {
    super();
  }

  /** @override */
  deinit(): void {
    (this.httpService as unknown) = undefined;
    (this.storageService as unknown) = undefined;
    this.invalidSessionObserver = undefined;
    this.session = undefined;
    super.deinit();
  }

  /**
   * When a we receive a 401 error from the server, we'll notify the observer.
   * Note that this applies only to sessions that are totally invalid. Sessions that
   * are expired but can be renewed are still considered to be valid. In those cases,
   * the server response is 498.
   * If the session has been revoked, then the observer will have its first
   * argument set to true.
   */
  public setInvalidSessionObserver(observer: InvalidSessionObserver): void {
    this.invalidSessionObserver = observer;
  }

  public async loadHost(): Promise<void> {
    const storedValue = await this.storageService.getValue(
      StorageKey.ServerHost
    );
    this.host =
      storedValue ||
      this.host ||
      (window as {
        _default_sync_server?: string;
      })._default_sync_server;
  }

  public async setHost(host: string): Promise<void> {
    this.host = host;
    await this.storageService.setValue(StorageKey.ServerHost, host);
  }

  public getHost(): string | undefined {
    return this.host;
  }

  public async setSession(session: Session, persist = true): Promise<void> {
    this.session = session;
    if (persist) {
      await this.storageService.setValue(StorageKey.Session, session);
    }
  }

  public getSession(): Session | undefined {
    return this.session;
  }

  /** Exposes apiVersion to tests */
  private get apiVersion() {
    return V0_API_VERSION;
  }

  private params(
    inParams: Record<string | number | symbol, unknown>
  ): HttpParams {
    const params = merge(inParams, {
      [ApiEndpointParam.ApiVersion]: this.apiVersion,
    });
    return params;
  }

  public createErrorResponse<T = unknown>(
    message: string,
    status?: StatusCode
  ): HttpResponse<T> {
    return { error: { message, status } } as HttpResponse<T>;
  }

  private errorResponseWithFallbackMessage(
    response: HttpResponse,
    message: string
  ) {
    if (!response.error?.message) {
      response.error = {
        ...response.error,
        status: response.error?.status ?? StatusCode.UnknownError,
        message,
      };
    }
    return response;
  }

  private processMetaObject(meta: ResponseMeta) {
    const {
      auth: { role, permissions },
    } = meta;
    if (role === undefined || permissions === undefined) return;

    this.permissionsService.update(meta.auth.role, meta.auth.permissions);
  }

  private processResponse(response: HttpResponse) {
    if (response.meta) {
      this.processMetaObject(response.meta);
    }
  }

  private async request(
    params: HttpRequestWithFallbackError
  ): Promise<HttpResponse<unknown>> {
    try {
      const response = await this.httpService.runHttp(params);
      this.processResponse(response);
      return response;
    } catch (errorResponse) {
      return this.errorResponseWithFallbackMessage(
        errorResponse,
        params.fallbackErrorMessage
      );
    }
  }

  private async getAuthMethods(
    email: string
  ): Promise<HttpResponse<GetAuthMethodsResponse>> {
    const params = this.params({ email });

    return this.request({
      verb: HttpVerb.Get,
      url: joinPaths(this.host, Paths.v1.authMethods),
      fallbackErrorMessage: messages.AUTH_METHODS_ERROR,
      params,
    }) as Promise<HttpResponse<GetAuthMethodsResponse>>;
  }

  private async requestWithMfa(
    httpRequest: HttpRequestWithFallbackError & {
      identifier: string;
    }
  ): Promise<HttpResponse> {
    const { identifier, ...restRequest } = httpRequest;

    for (;;) {
      const authMethodsResponse = await this.getAuthMethods(identifier);
      const mfaResult = await this.mfaService.handleMfa(authMethodsResponse);

      switch (mfaResult.status) {
        case MfaStatus.ErrorMissingCode: {
          // User dismissed window without input
          return this.createErrorResponse(
            messages.SignInStrings.SignInCanceledMissingMfa,
            StatusCode.CanceledMfa
          );
        }
        case MfaStatus.ErrorResponse: {
          const originalResponse = mfaResult.response;
          return {
            error: {
              message: messages.SignInStrings.ErrorFetchingAuthMethods,
              status: originalResponse.status,
              wrappedError: originalResponse.error,
            },
            status: originalResponse.status,
          };
        }
        default: {
          const mfaParams = this.mfaService.getMfaQueryParams(mfaResult);

          const response = await this.request({
            ...restRequest,
            params: {
              ...restRequest.params,
              ...mfaParams,
            },
          });

          if (response.error?.tag === ErrorTag.MfaInvalid) {
            // alert, then iterate (this is an infinite loop)
            await this.alertService.alert(messages.SignInStrings.IncorrectMfa);
          } else {
            return response;
          }
        }
      }
    }
  }

  public async enableMfa({
    userUuid,
    secret,
  }: {
    userUuid: Uuid;
    secret: string;
  }): Promise<HttpResponse<unknown>> {
    return this.request({
      verb: HttpVerb.Put,
      url: joinPaths(this.host, Paths.v1.putSetting(userUuid)),
      fallbackErrorMessage: messages.MFA_ENABLE_ERROR,
      authentication: this.session?.authorizationValue,
      params: {
        name: MfaSetting.MfaSecret,
        value: secret,
        serverEncryptionVersion: 1,
      },
    });
  }

  public async disableMfa(userUuid: Uuid): Promise<HttpResponse<unknown>> {
    return this.request({
      verb: HttpVerb.Delete,
      url: joinPaths(
        this.host,
        Paths.v1.deleteSetting({
          settingName: MfaSetting.MfaSecret,
          userUuid,
        })
      ),
      fallbackErrorMessage: messages.MFA_DISABLE_ERROR,
      authentication: this.session?.authorizationValue,
    });
  }

  public async getAccountKeyParams(
    email: string
  ): Promise<HttpResponse<KeyParamsResponse>> {
    const params = this.params({
      email,
    });

    const response = await this.requestWithMfa({
      identifier: email,
      verb: HttpVerb.Get,
      url: joinPaths(this.host, Paths.v1.keyParams),
      fallbackErrorMessage: messages.API_MESSAGE_GENERIC_INVALID_LOGIN,
      params,
      /** A session is optional here, if valid, endpoint returns extra params */
      authentication: this.session?.authorizationValue,
    });

    return this.responseV1toV0(response) as HttpResponse<KeyParamsResponse>;
  }

  public async register(
    email: string,
    serverPassword: string,
    keyParams: SNRootKeyParams,
    ephemeral: boolean
  ): Promise<RegistrationResponse> {
    if (this.registering) {
      return this.createErrorResponse(
        messages.API_MESSAGE_REGISTRATION_IN_PROGRESS
      ) as RegistrationResponse;
    }
    this.registering = true;
    const url = joinPaths(this.host, Paths.v1.register);
    const params = this.params({
      password: serverPassword,
      email,
      ephemeral,
      ...keyParams.getPortableValue(),
    });
    const response = await this.request({
      verb: HttpVerb.Post,
      url,
      fallbackErrorMessage: messages.API_MESSAGE_GENERIC_REGISTRATION_FAIL,
      params,
    });
    this.registering = false;

    return this.responseV1toV0(response) as RegistrationResponse;
  }

  public async signIn(
    email: string,
    serverPassword: string,
    ephemeral = false
  ): Promise<SignInResponse> {
    if (this.authenticating) {
      return this.createErrorResponse(
        messages.API_MESSAGE_LOGIN_IN_PROGRESS
      ) as SignInResponse;
    }
    this.authenticating = true;
    const url = joinPaths(this.host, Paths.v1.signIn);
    const params = this.params({
      email,
      password: serverPassword,
      ephemeral,
    });
    const response = await this.requestWithMfa({
      identifier: email,
      verb: HttpVerb.Post,
      url,
      params,
      fallbackErrorMessage: messages.API_MESSAGE_GENERIC_INVALID_LOGIN,
    });

    this.authenticating = false;

    return this.responseV1toV0(response) as SignInResponse;
  }

  public async signOut(): Promise<SignOutResponse> {
    const url = joinPaths(this.host, Paths.v1.signOut);
    const response = await this.httpService
      .postAbsolute(url, undefined, this.session!.authorizationValue)
      .catch((errorResponse) => {
        return errorResponse;
      });

    return this.responseV1toV0(response) as SignOutResponse;
  }

  async changePassword(
    currentServerPassword: string,
    newServerPassword: string,
    newKeyParams: SNRootKeyParams
  ): Promise<ChangePasswordResponse> {
    if (this.changing) {
      return this.createErrorResponse(
        messages.API_MESSAGE_CHANGE_PW_IN_PROGRESS
      );
    }
    const preprocessingError = this.preprocessingError();
    if (preprocessingError) {
      return preprocessingError;
    }
    this.changing = true;
    const url = joinPaths(this.host, Paths.v0.changePassword);
    const params = this.params({
      current_password: currentServerPassword,
      new_password: newServerPassword,
      ...newKeyParams.getPortableValue(),
    });
    const response = await this.httpService
      .postAbsolute(url, params, this.session!.authorizationValue)
      .catch(async (errorResponse) => {
        if (isErrorResponseExpiredToken(errorResponse)) {
          return this.refreshSessionThenRetryRequest({
            verb: HttpVerb.Post,
            url,
            params,
          });
        }
        return this.errorResponseWithFallbackMessage(
          errorResponse,
          messages.API_MESSAGE_GENERIC_CHANGE_PW_FAIL
        );
      });

    this.processResponse(response);

    this.changing = false;
    return response;
  }

  async sync(
    payloads: PurePayload[],
    lastSyncToken: string,
    paginationToken: string,
    limit: number,
    checkIntegrity = false,
    contentType?: ContentType,
    customEvent?: string
  ): Promise<HttpResponse> {
    const preprocessingError = this.preprocessingError();
    if (preprocessingError) {
      return preprocessingError;
    }
    const url = joinPaths(this.host, Paths.v0.sync);
    const params = this.params({
      [ApiEndpointParam.SyncPayloads]: payloads.map((p) => p.ejected()),
      [ApiEndpointParam.LastSyncToken]: lastSyncToken,
      [ApiEndpointParam.PaginationToken]: paginationToken,
      [ApiEndpointParam.IntegrityCheck]: checkIntegrity,
      [ApiEndpointParam.SyncDlLimit]: limit,
      content_type: contentType,
      event: customEvent,
    });
    const response = await this.httpService
      .postAbsolute(url, params, this.session!.authorizationValue)
      .catch<HttpResponse>(async (errorResponse) => {
        this.preprocessAuthenticatedErrorResponse(errorResponse);
        if (isErrorResponseExpiredToken(errorResponse)) {
          return this.refreshSessionThenRetryRequest({
            verb: HttpVerb.Post,
            url,
            params,
          });
        }
        return this.errorResponseWithFallbackMessage(
          errorResponse,
          messages.API_MESSAGE_GENERIC_SYNC_FAIL
        );
      });
    this.processResponse(response);

    return response;
  }

  private async refreshSessionThenRetryRequest(httpRequest: HttpRequest) {
    const sessionResponse = await this.refreshSession();
    if (sessionResponse?.error) {
      return sessionResponse;
    } else {
      return this.httpService
        .runHttp({
          ...httpRequest,
          authentication: this.session!.authorizationValue,
        })
        .catch((errorResponse) => {
          return errorResponse;
        });
    }
  }

  async refreshSession() {
    const preprocessingError = this.preprocessingError();
    if (preprocessingError) {
      return preprocessingError as SessionRenewalResponse;
    }
    this.refreshingSession = true;
    const url = joinPaths(this.host, Paths.v0.refreshSession);
    const session = this.session! as TokenSession;
    const params = this.params({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });
    const result = await this.httpService
      .postAbsolute(url, params)
      .then(async (response) => {
        const session = TokenSession.FromApiResponse(
          response as SessionRenewalResponse
        );
        await this.setSession(session);
        this.processResponse(response);
        return response;
      })
      .catch((errorResponse) => {
        this.preprocessAuthenticatedErrorResponse(errorResponse);
        return this.errorResponseWithFallbackMessage(
          errorResponse,
          messages.API_MESSAGE_GENERIC_TOKEN_REFRESH_FAIL
        );
      });
    this.refreshingSession = false;
    return result as SessionRenewalResponse;
  }

  async getSessionsList(): Promise<HttpResponse<RemoteSession[]>> {
    const preprocessingError = this.preprocessingError<RemoteSession[]>();
    if (preprocessingError) {
      return preprocessingError;
    }
    const url = joinPaths(this.host, Paths.v0.sessions);
    const response = await this.httpService
      .getAbsolute(url, {}, this.session!.authorizationValue)
      .catch(async (errorResponse) => {
        this.preprocessAuthenticatedErrorResponse(errorResponse);
        if (isErrorResponseExpiredToken(errorResponse)) {
          return this.refreshSessionThenRetryRequest({
            verb: HttpVerb.Get,
            url,
          });
        }
        return this.errorResponseWithFallbackMessage(
          errorResponse,
          messages.API_MESSAGE_GENERIC_SYNC_FAIL
        );
      });
    this.processResponse(response);

    return response;
  }

  async deleteSession(
    sessionId: UuidString
  ): Promise<RevisionListResponse | HttpResponse> {
    const preprocessingError = this.preprocessingError();
    if (preprocessingError) {
      return preprocessingError;
    }
    const url = joinPaths(this.host, Paths.v0.session);
    const response:
      | RevisionListResponse
      | HttpResponse = await this.httpService
      .deleteAbsolute(
        url,
        { uuid: sessionId },
        this.session!.authorizationValue
      )
      .catch((error: HttpResponse) => {
        const errorResponse = error as HttpResponse;
        this.preprocessAuthenticatedErrorResponse(errorResponse);
        if (isErrorResponseExpiredToken(errorResponse)) {
          return this.refreshSessionThenRetryRequest({
            verb: HttpVerb.Get,
            url,
          });
        }
        return this.errorResponseWithFallbackMessage(
          errorResponse,
          messages.API_MESSAGE_GENERIC_SYNC_FAIL
        );
      });
    this.processResponse(response);
    return response;
  }

  async getItemRevisions(
    itemId: UuidString
  ): Promise<RevisionListResponse | HttpResponse> {
    const preprocessingError = this.preprocessingError();
    if (preprocessingError) {
      return preprocessingError;
    }
    const url = joinPaths(this.host, Paths.v0.itemRevisions(itemId));
    const response:
      | RevisionListResponse
      | HttpResponse = await this.httpService
      .getAbsolute(url, undefined, this.session!.authorizationValue)
      .catch((errorResponse: HttpResponse) => {
        this.preprocessAuthenticatedErrorResponse(errorResponse);
        if (isErrorResponseExpiredToken(errorResponse)) {
          return this.refreshSessionThenRetryRequest({
            verb: HttpVerb.Get,
            url,
          });
        }
        return this.errorResponseWithFallbackMessage(
          errorResponse,
          messages.API_MESSAGE_GENERIC_SYNC_FAIL
        );
      });
    this.processResponse(response);
    return response;
  }

  async getRevision(
    entry: RevisionListEntry,
    itemId: UuidString
  ): Promise<SingleRevisionResponse | HttpResponse> {
    const preprocessingError = this.preprocessingError();
    if (preprocessingError) {
      return preprocessingError;
    }
    const url = joinPaths(this.host, Paths.v0.itemRevision(itemId, entry.uuid));
    const response:
      | SingleRevisionResponse
      | HttpResponse = await this.httpService
      .getAbsolute(url, undefined, this.session!.authorizationValue)
      .catch((errorResponse: HttpResponse) => {
        this.preprocessAuthenticatedErrorResponse(errorResponse);
        if (isErrorResponseExpiredToken(errorResponse)) {
          return this.refreshSessionThenRetryRequest({
            verb: HttpVerb.Get,
            url,
          });
        }
        return this.errorResponseWithFallbackMessage(
          errorResponse,
          messages.API_MESSAGE_GENERIC_SYNC_FAIL
        );
      });
    this.processResponse(response);
    return response;
  }

  private preprocessingError<T = unknown>() {
    if (this.refreshingSession) {
      return this.createErrorResponse<T>(
        messages.API_MESSAGE_TOKEN_REFRESH_IN_PROGRESS
      );
    }
    if (!this.session) {
      return this.createErrorResponse<T>(messages.API_MESSAGE_INVALID_SESSION);
    }
    return undefined;
  }

  /** Handle errored responses to authenticated requests */
  private preprocessAuthenticatedErrorResponse(response: HttpResponse) {
    if (
      response.status === StatusCode.HttpStatusInvalidSession &&
      this.session
    ) {
      this.invalidSessionObserver?.(
        response.error?.tag === ErrorTag.RevokedSession
      );
    }
  }

  /**
   * A workaround that allows using v1 responses without rewriting downstream logic that expects v0 responses.
   */
  private responseV1toV0<T>(response: HttpResponse<T>): HttpResponse<T> {
    return {
      ...response,
      ...response.data,
    };
  }
}
