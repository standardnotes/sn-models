# SNJS

SNJS is a client-side JavaScript library for [Standard Notes](https://standardnotes.org) that contains shared logic for all Standard Notes clients.

_Note: This branch covers the 004 protocol, which is in development. To view the current production code, switch over to the master branch._

## Introduction

SNJS (Standard Notes JavaScript) is a shared library we use in all Standard Notes clients (desktop, web, and mobile React Native). Its role is essentially to extract any business or data logic from client code, so that clients are mostly responsible for UI-level code, and don’t have to think about encryption and key stretching, or even authentication or storage specifics. Extracting the code into a shared library also prevents us from having to write the same critical code on multiple platforms.

The entry point of SNJS is the [`SNApplication`](https://github.com/standardnotes/snjs/blob/004/lib/application.js) class. The application class is a complete unit of application functionality. Theoretically, many instances of an application can be created, each with its own storage namespace and memory state. This can allow clients to support multiple user accounts.

An application must be supplied a custom subclass of [DeviceInterface](https://github.com/standardnotes/snjs/blob/004/lib/device_interface.js). This allows the library to generalize all behavior a client will need to perform throughout normal client operation, such as saving data to a local database store, saving key/values, and accessing the keychain.

The application interacts with a variety of services and managers to facilitate complete client functionality. While the distinction is not fully technical, a service can be thought of as a class that allows consumers to perform actions on demand, while a manager is responsible for managing and reacting to application state (but also expose on-demand functions). All managers and services live in `lib/services`.

On Web platforms SNJS interacts with [`sncrypto`](https://github.com/standardnotes/sncrypto/tree/004) to perform operations as mentioned in the [specification](https://github.com/standardnotes/snjs/blob/004/specification.md) document. This includes operations like key generation and data encryption.

SNJS also interacts with a Standard Notes [syncing-server](https://github.com/standardnotes/syncing-server), which is dumb data and sync store that deals with encrypted data, and never learns of client secrets or sensitive information.

## Installation

`npm install snjs`

## Integrating in module environment

```javascript
import { SNApplication } from 'snjs';
```

## Integrating in non-module web environment

```javascript
<script src="snjs.js"></script>
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
  alertService,
);
```

2. Launch the application:

```javascript
 await app.prepareForLaunch({
  receiveChallenge: (challenge, orchestrator) => {

  }
 });
 await app.launch();
```

Once the app is launched, you may perform any app-related functions, including:

### Signing into an account

```javascript
app.signIn(
  email,
  password
).then((response) => {

});
```

### Registering a new account

```javascript
app.register(
  email,
  password
).then((response) => {

});
```

### Lock the app with a passcode

```javascript
app.setPasscode(somePasscode).then(() => {

});
```

### Create a note

```javascript
const item = await app.createManagedItem(
  ContentType.Note,
  {
    title: 'Ideas',
    text: 'Coming soon.'
  }
);
/** Save the item both locally and sync with server */
await app.saveItem(item.uuid);
```

### Stream notes

```javascript
app.streamItems(
  contentType: ContentType.Note,
  (notes) => {
    reloadUI(notes);
  }
);
```

## Building

### Requirements

This repository uses `@standardnotes` packages from Github so before setting up make sure you have the `GITHUB_TOKEN` environment variable set. To generate your Github Personal Access Token go to your [Github Settings](https://github.com/settings/tokens) and make sure the token has [Github packages read and write rights](https://help.github.com/en/packages/publishing-and-managing-packages/about-github-packages#about-tokens)

### Setup

1. `npm install`
2. `npm run start` to start Webpack in development mode (watches changes), or `npm run bundle` to create dist files.

## Tests

Tests must be run in the browser due to WebCrypto dependency.

1. `npm test`
2. Open browser to `http://localhost:9001/test/test.html`.

Tests depend on a [syncing-server](https://github.com/standardnotes/syncing-server) instance running locally on port 3000 and using the `test` environment (`rails s -e test`) (Use branch `develop` of the server repository for latest). This port can be [configured](https://github.com/standardnotes/snjs/blob/004/test/lib/factory.js#L247) as necessary.

_Note:_ Many tests involve registering for a new account as part of the `beforeEach` block for that test suite. Each account registration call takes close to 1 second, as key generation with Argon2 is tuned to take close to 1 second. However, this will depend on machine performance. If a test fails due to timeout being exceeded, please increase the timeout for that test. Note that the browser tab which runs the tests must remain in the foreground while the tests are running due to browsers de-optimizing inactive tabs.

## Notes
- Almost all functions are asynchronous and return promises. [You can read about promises here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises).

## Help
Join the #dev channel in [our Slack group](https://standardnotes.org/slack) for help and discussion.
