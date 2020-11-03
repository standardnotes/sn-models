import {
  ContentType,
  SNPredicate,
  SNUserPrefs,
  UserPrefsMutator,
  WebPrefKey,
} from '@Lib/models';
import { WebPrefValue } from '@Lib/models/app/userPrefs';
import { FillItemContent } from '@Lib/models/functions';
import { PayloadField } from '@Lib/protocol/payloads';
import { ItemManager } from './item_manager';
import { PureService } from './pure_service';
import { SNSingletonManager } from './singleton_manager';
import { SyncEvent } from './sync/events';
import { SNSyncService } from './sync/sync_service';

export const enum PreferencesEvent {
  Changed = 'preferencesChanged',
}

export class PreferencesService extends PureService<PreferencesEvent> {
  private userPreferences?: SNUserPrefs;
  private loadingPrefs = false;
  private removeItemObserver?: () => void;
  private removeSyncObserver?: () => void;

  constructor(
    private singletonManager: SNSingletonManager,
    private itemManager: ItemManager,
    private syncService: SNSyncService
  ) {
    super();
    this.removeItemObserver = itemManager.addObserver(
      ContentType.UserPrefs,
      (changed, inserted, discarded) => {
        if (changed.length) {
          this.userPreferences = changed[0] as SNUserPrefs;
          this.notifyObservers();
        } else if (inserted.length) {
          this.userPreferences = inserted[0] as SNUserPrefs;
          this.notifyObservers();
        } else if (discarded.length) {
          this.userPreferences = undefined;
          this.reloadSingleton();
        }
      }
    );
    this.removeSyncObserver = syncService.addEventObserver(async (event) => {
      if (event === SyncEvent.FullSyncCompleted) {
        if (!this.userPreferences) {
          this.reloadSingleton();
        }
      }
    });
  }

  deinit() {
    this.removeItemObserver?.();
    this.removeSyncObserver?.();
    (this.singletonManager as any) = undefined;
    (this.itemManager as any) = undefined;
    (this.syncService as any) = undefined;
  }

  private notifyObservers() {
    this.notifyEvent(PreferencesEvent.Changed);
  }

  private async reloadSingleton() {
    if (this.loadingPrefs) {
      return;
    }

    this.loadingPrefs = true;
    const contentType = ContentType.UserPrefs;
    const predicate = new SNPredicate(
      PayloadField.ContentType,
      '=',
      contentType
    );
    const singleton = await this.singletonManager!.findOrCreateSingleton(
      predicate,
      contentType,
      FillItemContent({})
    );
    this.userPreferences = singleton as SNUserPrefs;
    this.loadingPrefs = false;
    this.syncService.sync();
    this.notifyObservers();
  }

  getValue<K extends WebPrefKey>(key: K, defaultValue: WebPrefValue[K]): WebPrefValue[K] {
    if (!this.userPreferences) {
      return defaultValue;
    }
    const value = this.userPreferences.getPref(key);
    return value ?? defaultValue;
  }

  async setValue<K extends WebPrefKey>(key: K, value: WebPrefValue[K]) {
    if (!this.userPreferences) {
      return;
    }
    await this.itemManager.changeItem<UserPrefsMutator>(
      this.userPreferences.uuid,
      (mutator) => {
        mutator.setWebPref(key, value);
      }
    );
    this.syncService.sync();
  }
}
