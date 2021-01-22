import { PurePayload } from '@Payloads/pure_payload';
import { ItemHistoryEntry } from '@Services/history/entries/item_history_entry';
import { CreateHistoryEntryForPayload } from '@Services/history/functions';
/**
 * The amount of characters added or removed that
 * constitute a keepable entry after optimization.
 */
const LARGE_ENTRY_DELTA_THRESHOLD = 15;

type ItemHistoryJson = {
  entries: ItemHistoryEntry[]
}

export class ItemSessionHistory {

  public entries: ItemHistoryEntry[] = []

  constructor(entries?: ItemHistoryEntry[]) {
    /** Deserialize the entries into entry objects. */
    if (entries) {
      for (const entry of entries) {
        entry.setPreviousEntry(this.getMostRecentEntry());
        this.entries.unshift(entry);
      }
    }
  }

  static FromJson(entryJson: ItemHistoryJson) {
    const entries = entryJson.entries.map((rawHistoryEntry: any) => {
      return CreateHistoryEntryForPayload(rawHistoryEntry.payload);
    });
    return new ItemSessionHistory(entries);
  }

  getMostRecentEntry() {
    /** First element in the array should be the last entry. */
    return this.entries[0];
  }

  addHistoryEntryForItem(payload: PurePayload) {
    const prospectiveEntry = CreateHistoryEntryForPayload(payload);
    const previousEntry = this.getMostRecentEntry();
    prospectiveEntry.setPreviousEntry(previousEntry);
    if (prospectiveEntry.isSameAsEntry(previousEntry)) {
      return;
    }
    this.entries.unshift(prospectiveEntry);
    return prospectiveEntry;
  }

  clear() {
    this.entries.length = 0;
  }

  optimize() {
    const keepEntries: ItemHistoryEntry[] = [];
    const isEntrySignificant = (entry: ItemHistoryEntry) => {
      return entry.deltaSize() > LARGE_ENTRY_DELTA_THRESHOLD;
    };
    const processEntry = (entry: ItemHistoryEntry, index: number, keep: boolean) => {
      /**
       * Entries may be processed retrospectively, meaning it can be
       * decided to be deleted, then an upcoming processing can change that.
       */
      if (keep) {
        keepEntries.unshift(entry);
      } else {
        /** Remove if in keep */
        const index = keepEntries.indexOf(entry);
        if (index !== -1) {
          keepEntries.splice(index, 1);
        }
      }
      if (keep && isEntrySignificant(entry) && entry.operationVector() === -1) {
        /** This is a large negative change. Hang on to the previous entry. */
        const previousEntry = this.entries[index + 1];
        if (previousEntry) {
          keepEntries.unshift(previousEntry);
        }
      }
    };
    for (let index = this.entries.length; index--;) {
      const entry = this.entries[index];
      if (index === 0 || index === this.entries.length - 1) {
        /** Keep the first and last */
        processEntry(entry, index, true);
      } else {
        const significant = isEntrySignificant(entry);
        processEntry(entry, index, significant);
      }
    }
    this.entries = this.entries.filter((entry, _index) => {
      return keepEntries.indexOf(entry) !== -1;
    });
  }
}
