import { SNItem, ItemMutator } from '@Models/core/item';
import { SNPredicate } from '@Models/core/predicate';

export enum WebPrefKey {
  TagsPanelWidth = 'tagsPanelWidth',
  NotesPanelWidth = 'notesPanelWidth',
  EditorWidth = 'editorWidth',
  EditorLeft = 'editorLeft',
  EditorMonospaceEnabled = 'monospaceFont',
  EditorSpellcheck = 'spellcheck',
  EditorResizersEnabled = 'marginResizersEnabled',
  SortNotesBy = 'sortBy',
  SortNotesReverse = 'sortReverse',
  NotesShowArchived = 'showArchived',
  NotesHidePinned = 'hidePinned',
  NotesHideNotePreview = 'hideNotePreview',
  NotesHideDate = 'hideDate',
  NotesHideTags = 'hideTags',
};

export type WebPrefValue = {
  [WebPrefKey.TagsPanelWidth]: number,
  [WebPrefKey.NotesPanelWidth]: number,
  [WebPrefKey.EditorWidth]: number | null,
  [WebPrefKey.EditorLeft]: number | null,
  [WebPrefKey.EditorMonospaceEnabled]: boolean,
  [WebPrefKey.EditorSpellcheck]: boolean,
  [WebPrefKey.EditorResizersEnabled]: boolean,
  [WebPrefKey.SortNotesBy]: string,
  [WebPrefKey.SortNotesReverse]: boolean,
  [WebPrefKey.NotesShowArchived]: boolean,
  [WebPrefKey.NotesHidePinned]: boolean,
  [WebPrefKey.NotesHideNotePreview]: boolean,
  [WebPrefKey.NotesHideDate]: boolean,
  [WebPrefKey.NotesHideTags]: boolean,
}

export class SNUserPrefs extends SNItem {

  get isSingleton() {
    return true;
  }

  get singletonPredicate() {
    return new SNPredicate('content_type', '=', this.content_type!);
  }

  getPref<T extends WebPrefKey>(key: T): WebPrefValue[T] | undefined {
    return this.getAppDomainValue(key as any);
  }
}

export class UserPrefsMutator extends ItemMutator {
  setWebPref(key: WebPrefKey, value: any) {
    this.setAppDataItem(key as any, value);
  }
}
