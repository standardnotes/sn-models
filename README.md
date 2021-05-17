# SNJS

[![lerna](https://img.shields.io/badge/maintained%20with-lerna-cc00ff.svg)](https://lerna.js.org/)

SNJS is a client-side JavaScript library for [Standard Notes](https://standardnotes.org) that contains shared logic for all Standard Notes clients.

## Introduction

SNJS (Standard Notes JavaScript) is a shared library we use in all Standard Notes clients (desktop, web, and mobile React Native). Its role is essentially to extract any business or data logic from client code, so that clients are mostly responsible for UI-level code, and don’t have to think about encryption and key stretching, or even authentication or storage specifics. Extracting the code into a shared library also prevents us from having to write the same critical code on multiple platforms.

The entry point of SNJS is the [`SNApplication`](lib/application.ts) class. The application class is a complete unit of application functionality. Theoretically, many instances of an application can be created, each with its own storage namespace and memory state. This can allow clients to support multiple user accounts.

An application must be supplied a custom subclass of [DeviceInterface](lib/device_interface.ts). This allows the library to generalize all behavior a client will need to perform throughout normal client operation, such as saving data to a local database store, saving key/values, and accessing the keychain.

The application interacts with a variety of services and managers to facilitate complete client functionality. While the distinction is not fully technical, a service can be thought of as a class that allows consumers to perform actions on demand, while a manager is responsible for managing and reacting to application state (but also expose on-demand functions). All managers and services live in `lib/services`.

On Web platforms SNJS interacts with [`sncrypto`](https://github.com/standardnotes/sncrypto/tree/004) to perform operations as mentioned in the [specification](./packages/snjs/specification.md) document. This includes operations like key generation and data encryption.

SNJS also interacts with a Standard Notes [syncing-server](https://github.com/standardnotes/syncing-server), which is dumb data and sync store that deals with encrypted data, and never learns of client secrets or sensitive information.

## Installation

`npm install snjs`

## Integrating in module environment

```javascript
import { SNApplication } from 'snjs';
```

## Integrating in non-module web environment

```javascript
<script src="snjs.js"></script>;
Object.assign(window, SNLibrary);
```

## Usage

1. Initialize an application:

```javascript
const deviceInterface = new DeviceInterfaceSubclass();
const alertService = new SNAlertServiceSubclass();
const app = new SNApplication(
  Environment.Web,
  Platform.LinuxWeb,
  deviceInterface,
  new SNWebCrypto(),
  alertService
);
```

2. Launch the application:

```javascript
await app.prepareForLaunch({
  receiveChallenge: (challenge, orchestrator) => {},
});
await app.launch();
```

Once the app is launched, you may perform any app-related functions, including:

### Signing into an account

```javascript
app.signIn(email, password).then((response) => {});
```

### Registering a new account

```javascript
app.register(email, password).then((response) => {});
```

### Lock the app with a passcode

```javascript
app.setPasscode(somePasscode).then(() => {});
```

### Create a note

```javascript
const item = await app.createManagedItem(ContentType.Note, {
  title: 'Ideas',
  text: 'Coming soon.',
});
/** Save the item both locally and sync with server */
await app.saveItem(item.uuid);
```

### Stream notes

```javascript
app.streamItems((contentType: ContentType.Note), (notes) => {
  reloadUI(notes);
});
```

## Building

1. `yarn install --pure-lockfile`
2. `yarn start` to start Webpack in development mode (watches changes), or `yarn build` to create dist files.

## Tests

Please make sure you have [Docker](https://www.docker.com) installed before running tests:

```
yarn test
```

Running packages/snjs tests:

```
yarn run start:test-server:dev

# Spins up server
yarn run test:e2e:dev-setup
```

Then either run

```
yarn run test:e2e:dev
```

Or open browser to `localhost:9002/test/test.html`.

## Notes

- Almost all functions are asynchronous and return promises. [You can read about promises here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises).

## Help

Join the #dev channel in [our Slack group](https://standardnotes.org/slack) for help and discussion.
