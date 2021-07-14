import DeviceInterface from './../setup/snjs/deviceInterface';
import * as Factory from './../factory';
import { SNApplicationGroup, RawStorageKey, DeinitSource } from '@Lib/index';

describe('application group', function () {
  const deviceInterface = new DeviceInterface(
    setTimeout.bind(window),
    setInterval.bind(window)
  );

  it('initializing a group should result with primary application', async function () {
    const group = new SNApplicationGroup(deviceInterface);
    await group.initialize({
      applicationCreator: (descriptor, deviceInterface) => {
        return Factory.createApplication(
          descriptor.identifier,
          deviceInterface
        );
      },
    });
    expect(group.primaryApplication).toBeTruthy;
    expect(group.primaryApplication.identifier).toBeTruthy();
  });

  it('initializing a group should result with proper descriptor setup', async function () {
    const group = new SNApplicationGroup(deviceInterface);
    await group.initialize({
      applicationCreator: (descriptor, deviceInterface) => {
        return Factory.createApplication(
          descriptor.identifier,
          deviceInterface
        );
      },
    });
    const identifier = group.primaryApplication.identifier;
    expect(group.descriptorRecord[identifier].identifier).toBe(identifier);
  });

  it('should persist descriptor record after changes', async function () {
    const group = new SNApplicationGroup(deviceInterface);
    await group.initialize({
      applicationCreator: (descriptor, deviceInterface) => {
        return Factory.createApplication(
          descriptor.identifier,
          deviceInterface
        );
      },
    });
    const identifier = group.primaryApplication.identifier;

    const descriptorRecord = await group.deviceInterface.getJsonParsedRawStorageValue(
      RawStorageKey.DescriptorRecord
    );
    expect(descriptorRecord[identifier].identifier).toBe(identifier);
    expect(descriptorRecord[identifier].primary).toBe(true);

    await group.addNewApplication();
    const descriptorRecord2 = await group.deviceInterface.getJsonParsedRawStorageValue(
      RawStorageKey.DescriptorRecord
    );
    expect(Object.keys(descriptorRecord2).length).toBe(2);

    expect(descriptorRecord2[identifier].primary).toBe(false);
    expect(
      descriptorRecord2[group.primaryApplication.identifier].primary
    ).toBe(true);
  });

  it('adding new application should incrememnt total descriptor count', async function () {
    const group = new SNApplicationGroup(deviceInterface);
    await group.initialize({
      applicationCreator: (descriptor, deviceInterface) => {
        return Factory.createApplication(
          descriptor.identifier,
          deviceInterface
        );
      },
    });
    const currentIdentifier = group.primaryApplication.identifier;
    await group.addNewApplication();

    expect(group.getDescriptors().length).toBe(2);
    expect(group.primaryApplication.identifier).not.toBe(currentIdentifier);
  });

  it('signing out of application should remove from group and create new', async function () {
    const group = new SNApplicationGroup(deviceInterface);
    await group.initialize({
      applicationCreator: (descriptor, deviceInterface) => {
        return Factory.createApplication(
          descriptor.identifier,
          deviceInterface
        );
      },
    });
    const application = group.primaryApplication;
    const identifier = application.identifier;
    await application.deinit(DeinitSource.SignOut);

    /**
     * On Safari 14.0.1 the new app instance will only be created on the
     * next tick
     */
    await Factory.sleep(0);
    expect(group.applications.length).toBe(1);

    /** Expect a new application to have been created */
    expect(group.applications[0].identifier).not.toBe(identifier);
  });

  it('should be notified when application changes', async function () {
    const group = new SNApplicationGroup(deviceInterface);
    let notifyCount = 0;
    const expectedCount = 2;
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve) => {
      group.addApplicationChangeObserver(() => {
        notifyCount++;
        if (notifyCount === expectedCount) {
          resolve();
        }
      });
      await group.initialize({
        applicationCreator: (descriptor, deviceInterface) => {
          return Factory.createApplication(
            descriptor.identifier,
            deviceInterface
          );
        },
      });
      await group.addNewApplication();
    }).then(() => {
      expect(notifyCount).toBe(expectedCount);
    });
  });
});
