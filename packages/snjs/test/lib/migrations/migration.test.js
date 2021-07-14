import * as Factory from './../../factory';
import {
  SNMigrationService,
  namespacedKey
} from '@Lib/index';

describe('migrations', () => {
  it('version number is stored as string', async function () {
    const application = await Factory.createInitAppWithRandNamespace();
    const version = await application.migrationService.getStoredSnjsVersion();
    expect(typeof version).toEqual('string');
    await application.deinit();
  });

  it('should return correct required migrations if stored version is 1.0.0', async function () {
    expect(
      (await SNMigrationService.getRequiredMigrations('1.0.0')).length
    ).toEqual(3);
  });

  it('should return correct required migrations if stored version is 2.0.0', async function () {
    expect(
      (await SNMigrationService.getRequiredMigrations('2.0.0')).length
    ).toEqual(2);
  });

  it('should return 0 required migrations if stored version is futuristic', async function () {
    expect(
      (await SNMigrationService.getRequiredMigrations('100.0.1')).length
    ).toEqual(0);
  });

  it('after running base migration, legacy structure should set version as 1.0.0', async function () {
    const application = await Factory.createAppWithRandNamespace();
    /** Set up 1.0.0 structure with tell-tale storage key */
    await application.deviceInterface.setRawStorageValue(
      'migrations',
      JSON.stringify(['anything'])
    );
    await application.migrationService.runBaseMigrationPreRun();
    expect(await application.migrationService.getStoredSnjsVersion()).toEqual(
      '1.0.0'
    );
    application.deinit();
  });

  it('after running base migration, 2.0.0 structure set version as 2.0.0', async function () {
    const application = await Factory.createAppWithRandNamespace();
    /** Set up 2.0.0 structure with tell-tale storage key */
    await application.deviceInterface.setRawStorageValue(
      namespacedKey(application.identifier, 'last_migration_timestamp'),
      'anything'
    );
    await application.migrationService.runBaseMigrationPreRun();
    expect(await application.migrationService.getStoredSnjsVersion()).toEqual(
      '2.0.0'
    );
    application.deinit();
  });

  it('after running base migration with no present storage values, should set version to current', async function () {
    const application = await Factory.createAppWithRandNamespace();
    await application.migrationService.runBaseMigrationPreRun();
    expect(await application.migrationService.getStoredSnjsVersion()).toEqual(
      SnjsVersion
    );
    application.deinit();
  });

  it('after running all migrations from a 1.0.0 installation, should set stored version to current', async function () {
    const application = await Factory.createAppWithRandNamespace();
    /** Set up 1.0.0 structure with tell-tale storage key */
    await application.deviceInterface.setRawStorageValue(
      'migrations',
      JSON.stringify(['anything'])
    );
    await application.prepareForLaunch({
      receiveChallenge: () => {},
    });
    await application.launch(true);
    expect(await application.migrationService.getStoredSnjsVersion()).toEqual(
      SnjsVersion
    );
    application.deinit();
  });

  it('after running all migrations from a 2.0.0 installation, should set stored version to current', async function () {
    const application = await Factory.createAppWithRandNamespace();
    /** Set up 2.0.0 structure with tell-tale storage key */
    await application.deviceInterface.setRawStorageValue(
      'last_migration_timestamp',
      JSON.stringify(['anything'])
    );
    await application.prepareForLaunch({
      receiveChallenge: () => {},
    });
    await application.launch(true);
    expect(await application.migrationService.getStoredSnjsVersion()).toEqual(
      SnjsVersion
    );
    application.deinit();
  });

  it('should be 2 required migration coming from 1.0.0', async function () {
    const application = await Factory.createAppWithRandNamespace();
    await application.deviceInterface.setRawStorageValue(
      'migrations',
      'anything'
    );
    await application.migrationService.runBaseMigrationPreRun();
    expect(await application.migrationService.getStoredSnjsVersion()).toEqual(
      '1.0.0'
    );
    const pendingMigrations = await SNMigrationService.getRequiredMigrations(
      await application.migrationService.getStoredSnjsVersion()
    );
    expect(pendingMigrations.length).toEqual(3);
    expect(pendingMigrations[0].version()).toEqual('2.0.0');
    await application.prepareForLaunch({
      receiveChallenge: () => {},
    });
    await application.launch(true);
    expect(await application.migrationService.getStoredSnjsVersion()).toEqual(
      SnjsVersion
    );
    application.deinit();
  });
});
