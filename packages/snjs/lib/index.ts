export {
  SnjsVersion,
  isRightVersionGreaterThanLeft,
  compareSemVersions,
} from './version';

export type { ApplicationDescriptor } from './application_group';
export type { ActionResponse } from './services/actions_service';
export type { BackupFile } from '@Services/protocol_service';
export type { UuidString, ApplicationIdentifier } from './types';

export { SNApplicationGroup } from './application_group';
export { DeinitSource } from './types';
export { KeyParamsOrigination } from './protocol/key_params';
export { KeyRecoveryStrings, SessionStrings } from './services/api/messages';
export type { RemoteSession } from './services/api/session';

export { SNApplication } from '@Lib/application';
export { SNProtocolService, KeyMode } from '@Services/protocol_service';
export { SNProtocolOperator001 } from '@Protocol/operator/001/operator_001';
export { SNProtocolOperator002 } from '@Protocol/operator/002/operator_002';
export { SNProtocolOperator003 } from '@Protocol/operator/003/operator_003';
export { SNProtocolOperator004 } from '@Protocol/operator/004/operator_004';
export { SNRootKey } from '@Protocol/root_key';
export { SNRootKeyParams } from './protocol/key_params';
export { DeviceInterface } from '@Lib/device_interface';
export {
  SNItem,
  ItemMutator,
  AppDataField,
  SNItemsKey,
  SNPredicate,
  SNNote,
  NoteMutator,
  SNTag,
  TagMutator,
  SNSmartTag,
  SNActionsExtension,
  ActionsExtensionMutator,
  Action,
  SNTheme,
  ThemeMutator,
  SNComponent,
  ComponentAction,
  ComponentMutator,
  SNEditor,
  SNUserPrefs,
  UserPrefsMutator,
  PrefKey,
} from './models';
export type { PrefValue } from './models';
export { MutationType } from '@Models/core/item';
export { ComponentArea } from './models/app/component';
export type { ComponentPermission } from './models/app/component';
export { LiveItem } from './models/live_item';

export type { PermissionDialog } from './services/component_manager';
export { SNComponentManager } from './services/component_manager';
export { HistoryEntry } from '@Services/history/entries/history_entry';
export { PayloadManager } from './services/payload_manager';
export { ItemManager } from './services/item_manager';
export { SNHttpService } from './services/api/http_service';
export { ChallengeService } from './services/challenge/challenge_service';
export { PureService } from '@Services/pure_service';
export { ApplicationService } from '@Services/application_service';
export {
  SNStorageService,
  StoragePersistencePolicies,
  StorageEncryptionPolicies,
  StorageValueModes,
  ValueModesKeys,
} from './services/storage_service';
export {
  Challenge,
  ChallengeReason,
  ChallengeResponse,
  ChallengeValidation,
  ChallengeValue,
  ChallengePrompt,
} from '@Lib/challenges';

export {
  SNSyncService,
  SyncSources,
  SyncModes,
  SyncQueueStrategy,
} from './services/sync/sync_service';
export { SyncResponse } from './services/sync/response';
export { payloadsByPreparingForServer } from './services/sync/account/operation';
export { SyncResponseResolver } from '@Services/sync/account/response_resolver';
export { SyncOpStatus } from './services/sync/sync_op_status';
export { SortPayloadsByRecentAndContentPriority } from './services/sync/utils';
export { SNSessionManager } from './services/api/session_manager';
export { SNMigrationService } from './services/migration_service';
export { ButtonType } from './services/alert_service';
export type {
  DismissBlockingDialog,
  SNAlertService,
} from './services/alert_service';
export { SNHistoryManager } from './services/history/history_manager';
export { SNProtectionService } from './services/protection_service';
export { SNSingletonManager } from './services/singleton_manager';
export { SNApiService } from './services/api/api_service';
export type {
  RevisionListEntry,
  SingleRevision,
} from './services/api/responses';
export {
  addIfUnique,
  arrayByDifference,
  Copy,
  dateSorted,
  deepMerge,
  dictToArray,
  extendArray,
  findInArray,
  getGlobalScope,
  greaterOfTwoDates,
  isNullOrUndefined,
  isSameDay,
  jsonParseEmbeddedKeys,
  omitInPlace,
  omitUndefinedCopy,
  removeFromArray,
  removeFromIndex,
  subtractFromArray,
  topLevelCompare,
  truncateHexString,
  uniqueArrayByKey,
  uniqCombineObjArrays,
} from './utils';
export { Uuid } from '@Lib/uuid';
export {
  EncryptionIntent,
  isLocalStorageIntent,
  isFileIntent,
  isDecryptedIntent,
  intentRequiresEncryption,
  ContentTypeUsesRootKeyEncryption,
} from '@Protocol/intents';
export { ContentType } from '@Models/content_types';
export { CreateItemFromPayload } from '@Models/generator';
export { Uuids, FillItemContent } from '@Models/functions';

export { ApplicationEvent } from '@Lib/events';
export {
  Environment,
  Platform,
  isEnvironmentWebOrDesktop,
  isEnvironmentMobile,
  platformFromString,
  environmentFromString,
} from '@Lib/platforms';
export { SyncEvent } from '@Lib/services/sync/events';

/** Payloads */
export { MutableCollection } from '@Protocol/collection/collection';
export { ImmutablePayloadCollection } from '@Protocol/collection/payload_collection';
export {
  ItemCollection,
  CollectionSort,
} from '@Protocol/collection/item_collection';
export {
  CreateMaxPayloadFromAnyObject,
  CreateSourcedPayloadFromObject,
  CreateIntentPayloadFromObject,
  CreateEncryptionParameters,
  PayloadByMerging,
  CopyPayload,
} from '@Payloads/generator';
export {
  PayloadSource,
  isPayloadSourceRetrieved,
  isPayloadSourceInternalChange,
} from '@Lib/protocol/payloads/sources';
export { ProtocolVersion } from '@Lib/protocol/versions';
export { PayloadFormat } from '@Payloads/formats';
export { PurePayload } from '@Payloads/pure_payload';
export { PayloadField } from '@Payloads/fields';
export type { PayloadContent } from '@Payloads/generator';

export {
  NotesDisplayCriteria,
  notesMatchingCriteria,
} from '@Lib/protocol/collection/notes_display_criteria';

export {
  StorageKey,
  RawStorageKey,
  NonwrappedStorageKey,
  namespacedKey,
} from '@Lib/storage_keys';

/** Migrations */
export { BaseMigration } from '@Lib/migrations/base';

export { ProtectionSessionDurations } from '@Lib/services/protection_service';

export { SNLog } from './log';

export { Permission } from '@standardnotes/auth';
