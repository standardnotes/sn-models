import { SNRootKey } from './protocol/root_key';
export declare type ChallengeArtifacts = {
    wrappingKey?: SNRootKey;
    rootKey?: SNRootKey;
};
export declare enum ChallengeValidation {
    None = 0,
    LocalPasscode = 1,
    AccountPassword = 2,
    Biometric = 3
}
/** The source of the challenge */
export declare enum ChallengeReason {
    ApplicationUnlock = 1,
    ResaveRootKey = 2,
    ProtocolUpgrade = 3,
    Migration = 4,
    Custom = 5
}
/**
 * A challenge is a stateless description of what the client needs to provide
 * in order to proceed.
 */
export declare class Challenge {
    readonly prompts: ChallengePrompt[];
    readonly reason: ChallengeReason;
    readonly _heading?: string | undefined;
    readonly _subheading?: string | undefined;
    readonly id: number;
    constructor(prompts: ChallengePrompt[], reason: ChallengeReason, _heading?: string | undefined, _subheading?: string | undefined);
    /** Outside of the modal, this is the title of the modal itself */
    get modalTitle(): string;
    /** Inside of the modal, this is the H1 */
    get heading(): string;
    /** Inside of the modal, this is the H2 */
    get subheading(): string | undefined;
    hasPromptForValidationType(type: ChallengeValidation): boolean;
}
/**
 * A Challenge can have many prompts. Each prompt represents a unique input,
 * such as a text field, or biometric scanner.
 */
export declare class ChallengePrompt {
    readonly validation: ChallengeValidation;
    readonly _title?: string | undefined;
    readonly placeholder?: string | undefined;
    readonly secureTextEntry: boolean;
    readonly id: number;
    constructor(validation: ChallengeValidation, _title?: string | undefined, placeholder?: string | undefined, secureTextEntry?: boolean);
    get validates(): boolean;
    get title(): string;
}
export declare class ChallengeValue {
    readonly prompt: ChallengePrompt;
    readonly value: string | boolean;
    constructor(prompt: ChallengePrompt, value: string | boolean);
}
export declare class ChallengeResponse {
    readonly challenge: Challenge;
    readonly values: ChallengeValue[];
    readonly artifacts?: ChallengeArtifacts | undefined;
    constructor(challenge: Challenge, values: ChallengeValue[], artifacts?: ChallengeArtifacts | undefined);
    getValueForType(type: ChallengeValidation): ChallengeValue;
    getDefaultValue(): ChallengeValue;
}
