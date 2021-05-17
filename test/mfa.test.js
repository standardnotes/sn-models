/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
import * as Factory from './lib/factory.js';
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('Multi-Factor Authentication (MFA)', function () {
  beforeEach(async function () {
    localStorage.clear();
    this.application = await Factory.createInitAppWithRandNamespace();
    this.email = Uuid.GenerateUuidSynchronously();
    this.password = Uuid.GenerateUuidSynchronously();
  });

  afterEach(function () {
    this.application.deinit();
    this.application = null;
    localStorage.clear();
  });

  it('mfa flow', async function () {
    // in case the MFA code changes between calls
    this.retries(1)

    const application = this.application
    const email = this.email
    const password = this.password

    const expectNoPrompt = () => {
      application.setLaunchCallback({
        receiveChallenge: (challenge) => {
          expect.fail('expected no MFA prompt.')
        },
      });
    }
    const withValidCode = async (fn) => {
      // note: trying to generate an MFA code that is as fresh as possible to minimize the odds that it will change between calls
      application.setLaunchCallback({
        receiveChallenge: (challenge) => {
          const values = challenge.prompts.map(
            (prompt) =>
              new ChallengeValue(
                prompt,
                prompt.validation === ChallengeValidation.ProtectionSessionDuration
                  ? 0
                  : otplib.authenticator.generate(secret)
              )
          );
          application.submitValuesForChallenge(challenge, values);
        },
      });
      await fn()
    }

    const registrationInfo = await Factory.registerUserToApplication({
      application,
      email,
      password,
    });

    const userUuid = registrationInfo.user.uuid
    const secret = 'SECRET'
    const invalidCode = "INVALID MFA CODE"
    const expectedVersion = '004'

    const signOut = async () => {
      const response = await application.apiService.signOut();
      application.apiService.session = undefined;
      expect(response.status).to.equal(204)
    }
    await signOut()

    const initialKeyParamsWhenSignedOut = await application.apiService.getAccountKeyParams(this.email)
    expect(initialKeyParamsWhenSignedOut.version).to.equal(expectedVersion)

    const enableWhileSignedOutResponse = await application.apiService.enableMfa({
      userUuid,
      secret,
    })
    expect(enableWhileSignedOutResponse.status).to.equal(401)

    const signIn = async () => {
      const response = await application.sessionManager.signIn(email, password);
      const currentSession = application.apiService.getSession();

      expect(response.response.user.uuid).to.equal(userUuid)
      expect(currentSession).to.not.be.undefined
    }
    await signIn()

    const keyParamsAfterSignIn = await application.apiService.getAccountKeyParams(this.email)
    expect(keyParamsAfterSignIn.version).to.equal(expectedVersion)

    const initialEnableWhileSignedInResponse = await application.apiService.enableMfa({
      userUuid,
      secret,
    })
    expect(initialEnableWhileSignedInResponse.status).to.equal(201)

    // todo: should this request be made w/o prompting for mfa code?
    // expectNoPrompt()
    Factory.handlePasswordChallenges(application, invalidCode);
    const keyParamsAfterSignInEnableWithInvalidCode = await application.apiService.getAccountKeyParams(this.email)
    expect(keyParamsAfterSignInEnableWithInvalidCode.version).to.equal(expectedVersion)

    await withValidCode(async () => {
      const keyParamsAfterSignInEnableWithValidCode = await application.apiService.getAccountKeyParams(this.email)
      expect(keyParamsAfterSignInEnableWithValidCode.version).to.equal(expectedVersion)
    })

    await signOut()

    Factory.handlePasswordChallenges(application, invalidCode);
    const keyParamsAfterEnableSignOutWithInvalidCode = await application.apiService.getAccountKeyParams(this.email)
    expect(keyParamsAfterEnableSignOutWithInvalidCode.status).to.equal(401)

    await withValidCode(async () => {
      const keyParamsAfterEnableSignOutWithValidCode = await application.apiService.getAccountKeyParams(this.email)
      expect(keyParamsAfterEnableSignOutWithValidCode.version).to.equal(expectedVersion)
    })

    const disableAfterEnableSignOut = await application.apiService.disableMfa(userUuid)
    expect(disableAfterEnableSignOut.status).to.equal(401)

    Factory.handlePasswordChallenges(application, invalidCode);
    const signInAfterEnableSignOutWithInvalidCode = await application.sessionManager.signIn(email, password);
    expect(signInAfterEnableSignOutWithInvalidCode.response.status).to.equal(401)
    expect(application.apiService.getSession()).to.be.undefined

    await withValidCode(signIn)

    const disableAfterEnableSignIn = await application.apiService.disableMfa(userUuid)

    expect(disableAfterEnableSignIn.status).to.equal(200)

    expectNoPrompt()
    const keyParamsAfterDisable = await application.apiService.getAccountKeyParams(this.email)
    expect(keyParamsAfterDisable.version).to.equal(expectedVersion)

    await signOut()

    const keyParamsAfterDisableSignOut = await application.apiService.getAccountKeyParams(this.email)
    expect(keyParamsAfterDisableSignOut.version).to.equal(expectedVersion)
  }).timeout(35000);
})
