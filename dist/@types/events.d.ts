import { SyncEvent } from './services/sync/events';
export { SyncEvent };
export declare enum ApplicationEvent {
    SignedIn = 2,
    SignedOut = 3,
    /** When a full, potentially multi-page sync completes */
    CompletedFullSync = 5,
    FailedSync = 6,
    HighLatencySync = 7,
    EnteredOutOfSync = 8,
    ExitedOutOfSync = 9,
    /**
     * The application has finished it `prepareForLaunch` state and is now ready for unlock
     * Called when the application has initialized and is ready for launch, but before
     * the application has been unlocked, if applicable. Use this to do pre-launch
     * configuration, but do not attempt to access user data like notes or tags.
     */
    Started = 10,
    /**
     * The application has loaded all pending migrations (but not run any, except for the base one),
     * and consumers may now call `hasPendingMigrations`
     */
    MigrationsLoaded = 23,
    /**
     * The applicaiton is fully unlocked and ready for i/o
     * Called when the application has been fully decrypted and unlocked. Use this to
     * to begin streaming data like notes and tags.
     */
    Launched = 11,
    LocalDataLoaded = 12,
    /**
     * When the root key or root key wrapper changes. Includes events like account state
     * changes (registering, signing in, changing pw, logging out) and passcode state
     * changes (adding, removing, changing).
     */
    KeyStatusChanged = 13,
    MajorDataChange = 14,
    CompletedRestart = 15,
    LocalDataIncrementalLoad = 16,
    SyncStatusChanged = 17,
    WillSync = 18,
    InvalidSyncSession = 19,
    LocalDatabaseReadError = 20,
    LocalDatabaseWriteError = 21,
    /** When a single roundtrip completes with sync, in a potentially multi-page sync request.
     * If just a single roundtrip, this event will be triggered, along with CompletedFullSync */
    CompletedIncrementalSync = 22
}
export declare function applicationEventForSyncEvent(syncEvent: SyncEvent): any;
