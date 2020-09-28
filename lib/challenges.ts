import { Migration } from '@Lib/migrations/migration';
import { ChallengeModalTitle, ChallengeStrings, PromptTitles } from './services/api/messages';
import { SNRootKey } from '@Protocol/root_key';

export type ChallengeArtifacts = {
  wrappingKey?: SNRootKey
  rootKey?: SNRootKey
}

export enum ChallengeValidation {
  None = 0,
  LocalPasscode = 1,
  AccountPassword = 2,
  Biometric = 3,
};
/** The source of the challenge */
export enum ChallengeReason {
  ApplicationUnlock = 1,
  ResaveRootKey = 2,
  ProtocolUpgrade = 3,
  Migration = 4,
  Custom = 5
};

/**
 * A challenge is a stateless description of what the client needs to provide
 * in order to proceed.
 */
export class Challenge {
  public readonly id = Math.random();

  constructor(
    public readonly prompts: ChallengePrompt[],
    public readonly reason: ChallengeReason,
    public readonly _heading?: string,
    public readonly _subheading?: string
  ) {
    Object.freeze(this);
  }

  /** Outside of the modal, this is the title of the modal itself */
  get modalTitle() {
    switch (this.reason) {
      case ChallengeReason.Migration:
        return ChallengeModalTitle.Migration;
      default:
        return ChallengeModalTitle.Generic;
    }
  }

  /** Inside of the modal, this is the H1 */
  get heading() {
    if (this._heading) {
      return this._heading;
    } else {
      switch (this.reason) {
        case ChallengeReason.ApplicationUnlock:
          return ChallengeStrings.UnlockApplication;
        case ChallengeReason.Migration:
          return ChallengeStrings.EnterLocalPasscode;
        case ChallengeReason.ResaveRootKey:
          return ChallengeStrings.EnterPasscodeForRootResave;
        case ChallengeReason.ProtocolUpgrade:
          return ChallengeStrings.EnterCredentialsForProtocolUpgrade;
        default:
          throw Error('No heading available for custom challenge. Pass heading to the constructor.')
      }
    }
  }

  /** Inside of the modal, this is the H2 */
  get subheading() {
    if (this._subheading) {
      return this._subheading;
    }

    switch (this.reason) {
      case ChallengeReason.Migration:
        return ChallengeStrings.EnterPasscodeForMigration;
      case ChallengeReason.ApplicationUnlock:
        return undefined;
      default:
        throw Error('No subheading available for custom challenge. Pass subheading to the constructor.')
    }
  }

  hasPromptForValidationType(type: ChallengeValidation) {
    for (const prompt of this.prompts) {
      if (prompt.validation === type) {
        return true;
      }
    }
    return false;
  }
}

/**
 * A Challenge can have many prompts. Each prompt represents a unique input,
 * such as a text field, or biometric scanner.
 */
export class ChallengePrompt {
  public readonly id = Math.random();
  constructor(
    public readonly validation: ChallengeValidation,
    public readonly _title?: string,
    public readonly placeholder?: string,
    public readonly secureTextEntry = true
  ) {
    Object.freeze(this);
  }

  public get validates() {
    return this.validation !== ChallengeValidation.None;
  }

  public get title() {
    if (this._title) {
      return this._title;
    }
    switch (this.validation) {
      case ChallengeValidation.AccountPassword:
        return PromptTitles.AccountPassword;
      case ChallengeValidation.Biometric:
        return PromptTitles.Biometrics;
      case ChallengeValidation.LocalPasscode:
        return PromptTitles.LocalPasscode;
      default:
        throw Error('No title available for custom prompt. Pass title to the constructor.')
    }
  }
}

export class ChallengeValue {
  constructor(
    public readonly prompt: ChallengePrompt,
    public readonly value: string | boolean,
  ) {
    Object.freeze(this);
  }
}

export class ChallengeResponse {
  constructor(
    public readonly challenge: Challenge,
    public readonly values: ChallengeValue[],
    public readonly artifacts?: ChallengeArtifacts,
  ) {
    Object.freeze(this);
  }

  getValueForType(type: ChallengeValidation) {
    return this.values.find((value) => value.prompt.validation === type)!;
  }

  getDefaultValue() {
    if (this.values.length > 1) {
      throw Error('Attempting to retrieve default response value when more than one value exists');
    }
    return this.values[0];
  }
}
