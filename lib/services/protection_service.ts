import {
  Challenge,
  ChallengePrompt,
  ChallengeReason,
  ChallengeValidation,
} from '@Lib/challenges';
import { ChallengeService } from './challenge/challenge_service';
import { PureService } from '@Lib/services/pure_service';
import { SNLog } from '@Lib/log';
import { SNNote } from '@Lib/models';
import { SNProtocolService } from './protocol_service';
import { SNStorageService } from '@Services/storage_service';
import { StorageKey } from '@Lib/storage_keys';
import { isNullOrUndefined } from '@Lib/utils';

enum ProtectionSessionLengthSeconds {
  None = 0,
  FiveMinutes = 300,
  OneHour = 3600,
  OneWeek = 604800,
}

export function isValidProtectionSessionLength(number: unknown): boolean {
  return (
    typeof number === 'number' &&
    Object.values(ProtectionSessionLengthSeconds).includes(number)
  );
}

export const ProtectionSessionDurations = [
  {
    valueInSeconds: ProtectionSessionLengthSeconds.None,
    label: "Don't Remember",
  },
  {
    valueInSeconds: ProtectionSessionLengthSeconds.FiveMinutes,
    label: '5 Minutes',
  },
  {
    valueInSeconds: ProtectionSessionLengthSeconds.OneHour,
    label: '1 Hour',
  },
  {
    valueInSeconds: ProtectionSessionLengthSeconds.OneWeek,
    label: '1 Week',
  },
];

/**
 * Enforces certain actions to require extra authentication,
 * like viewing a protected note, as well as managing how long that
 * authentication should be valid for.
 */
export class SNProtectionService extends PureService {
  constructor(
    private protocolService: SNProtocolService,
    private challengeService: ChallengeService,
    private storageService: SNStorageService
  ) {
    super();
  }

  public deinit(): void {
    (this.protocolService as unknown) = undefined;
    (this.challengeService as unknown) = undefined;
    (this.storageService as unknown) = undefined;
    super.deinit();
  }

  async authorizeNoteAccess(note: SNNote): Promise<boolean> {
    if (!note.protected) {
      return true;
    }

    return this.validateOrRenewSession(ChallengeReason.AccessProtectedNote);
  }

  async authorizeFileImport(): Promise<boolean> {
    return this.validateOrRenewSession(ChallengeReason.ImportFile);
  }

  async authorizeAutolockIntervalChange(): Promise<boolean> {
    return this.validateOrRenewSession(ChallengeReason.ChangeAutolockInterval);
  }

  async authorizeSessionRevoking(): Promise<boolean> {
    return this.validateOrRenewSession(ChallengeReason.RevokeSession);
  }

  async authorizeBatchManagerAccess(): Promise<boolean> {
    return this.validateOrRenewSession(ChallengeReason.AccessBatchManager);
  }

  private async validateOrRenewSession(
    reason: ChallengeReason
  ): Promise<boolean> {
    if ((await this.getSessionExpirey()) > new Date()) {
      return true;
    }

    const prompts: ChallengePrompt[] = [];
    if (await this.challengeService.hasBiometricsEnabled()) {
      prompts.push(new ChallengePrompt(ChallengeValidation.Biometric));
    }
    if (this.protocolService.hasPasscode()) {
      prompts.push(new ChallengePrompt(ChallengeValidation.LocalPasscode));
    }
    if (prompts.length === 0) {
      if (this.protocolService.hasAccount()) {
        /** Add account password as a bare-minimum safety check */
        prompts.push(new ChallengePrompt(ChallengeValidation.AccountPassword));
      } else {
        /** No protection set up; grant access */
        return true;
      }
    }

    prompts.push(
      new ChallengePrompt(
        ChallengeValidation.ProtectionSessionDuration,
        undefined,
        undefined,
        undefined,
        undefined,
        await this.getSessionLength()
      )
    );

    const response = await this.challengeService.promptForChallengeResponse(
      new Challenge(prompts, reason, true)
    );
    if (response) {
      const length = response.values.find(
        (value) =>
          value.prompt.validation ===
          ChallengeValidation.ProtectionSessionDuration
      )?.value;
      if (isNullOrUndefined(length)) {
        SNLog.error(
          Error('No valid protection session length found. Got ' + length)
        );
      } else {
        await this.setSessionLength(length as ProtectionSessionLengthSeconds);
      }
      return true;
    } else {
      return false;
    }
  }

  private async getSessionLength(): Promise<number> {
    const length = await this.storageService.getValue(
      StorageKey.ProtectionSessionLength
    );
    if (length) {
      return length;
    } else {
      return ProtectionSessionLengthSeconds.None;
    }
  }

  private async setSessionLength(
    length: ProtectionSessionLengthSeconds
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + length);
    await this.storageService.setValue(StorageKey.ProtectionExpirey, expiresAt);
    await this.storageService.setValue(
      StorageKey.ProtectionSessionLength,
      length
    );
  }

  private async getSessionExpirey(): Promise<Date> {
    const expiresAt = await this.storageService.getValue(
      StorageKey.ProtectionExpirey
    );
    if (expiresAt) {
      return new Date(expiresAt);
    } else {
      return new Date();
    }
  }
}
