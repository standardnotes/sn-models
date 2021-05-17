import {
  Challenge,
  ChallengeKeyboardType,
  ChallengePrompt,
  ChallengeReason,
  ChallengeValidation,
} from '@Lib/challenges';
import { AuthMethods, MfaPayload } from '@standardnotes/auth';
import { ChallengeService } from '..';
import { PureService } from '../pure_service';
import { PromptTitles, SessionStrings } from './messages';
import { HttpResponse } from './responses';

export enum MfaStatus {
  EnteredCode = 'mfa-entered-code',
  NotRequired = 'mfa-not-required',

  ErrorMissingCode = 'mfa-error-missing-code',
  ErrorResponse = 'mfa-error-response',
}

export type MfaResult = MfaResultSuccess | MfaResultError;

export type MfaResultSuccess =
  | {
      status: MfaStatus.EnteredCode;
      payload: MfaPayload;
    }
  | {
      status: MfaStatus.NotRequired;
    };

export type MfaResultError =
  | {
      status: MfaStatus.ErrorResponse;
      response: HttpResponse;
    }
  | {
      status: MfaStatus.ErrorMissingCode;
    };

export type GetAuthMethodsResponse = {
  success: true;
  methods: AuthMethods;
};

export type MfaQueryParams = {
  mfa_key: string;
};

export class SNMfaService extends PureService {
  constructor(private challengeService: ChallengeService) {
    super();
  }

  public async handleMfa(
    authMethodsResponse: HttpResponse<GetAuthMethodsResponse>
  ): Promise<MfaResult> {
    if (authMethodsResponse.data?.success) {
      const { totp } = authMethodsResponse.data.methods;

      if (totp) {
        const enteredMfaCode = await this.promptForMfaValue();

        if (enteredMfaCode === undefined) {
          return {
            status: MfaStatus.ErrorMissingCode,
          };
        }

        return {
          status: MfaStatus.EnteredCode,
          payload: {
            mfa_key: enteredMfaCode,
          },
        };
      }

      return {
        status: MfaStatus.NotRequired,
      };
    }

    return {
      status: MfaStatus.ErrorResponse,
      response: authMethodsResponse,
    };
  }

  public getMfaQueryParams(
    mfaResult: MfaResultSuccess
  ): MfaQueryParams | Record<string, never> {
    if (mfaResult.status === MfaStatus.EnteredCode) {
      return mfaResult.payload;
    }
    if (mfaResult.status === MfaStatus.NotRequired) {
      return {};
    }

    const exhaustiveCheck: never = mfaResult;
    throw new Error(
      `Unrecognized MFA status: ${JSON.stringify(exhaustiveCheck)}!`
    );
  }

  private async promptForMfaValue() {
    const challenge = new Challenge(
      [
        new ChallengePrompt(
          ChallengeValidation.None,
          PromptTitles.Mfa,
          SessionStrings.MfaInputPlaceholder,
          false,
          ChallengeKeyboardType.Numeric
        ),
      ],
      ChallengeReason.Custom,
      true,
      SessionStrings.EnterMfa
    );
    const response = await this.challengeService.promptForChallengeResponse(
      challenge
    );
    if (response) {
      this.challengeService.completeChallenge(challenge);
      return response.values[0].value as string;
    }
  }
}
