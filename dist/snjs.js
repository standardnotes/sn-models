(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("SNLibrary", [], factory);
	else if(typeof exports === 'object')
		exports["SNLibrary"] = factory();
	else
		root["SNLibrary"] = factory();
})(window, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./lib/main.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./lib/main.js":
/*!*********************!*\
  !*** ./lib/main.js ***!
  \*********************/
/*! exports provided: SNApplication, SNProtocolService, SNProtocolOperator001, SNProtocolOperator002, SNProtocolOperator003, SNProtocolOperator004, DeviceInterface, SFItem, SNItemsKey, SFPredicate, SNNote, SNTag, SNSmartTag, SNMfa, SNServerExtension, SNComponent, SNEditor, SNActionsExtension, Action, SNTheme, SNEncryptedStorage, SNComponentManager, HistorySession, ItemHistory, ItemHistoryEntry, SFPrivileges, SNWebCrypto, SNReactNativeCrypto, SNModelManager, SNHttpManager, DeviceAuthService, DeviceAuthResponse, SNStorageManager, STORAGE_PERSISTENCE_POLICY_DEFAULT, STORAGE_PERSISTENCE_POLICY_EPHEMERAL, STORAGE_ENCRYPTION_POLICY_DEFAULT, STORAGE_ENCRYPTION_POLICY_DISABLED, STORAGE_VALUE_MODE_DEFAULT, STORAGE_VALUE_MODE_NONWRAPPED, Challenges, SNSyncManager, TIMING_STRATEGY_RESOLVE_ON_NEXT, TIMING_STRATEGY_FORCE_SPAWN_NEW, SNSessionManager, SNMigrationService, SNAlertManager, SNHistoryManager, SNPrivilegesManager, SNSingletonManager, SNKeyManager, KEY_MODE_ROOT_KEY_NONE, KEY_MODE_ROOT_KEY_ONLY, KEY_MODE_ROOT_KEY_PLUS_WRAPPER, KEY_MODE_WRAPPER_ONLY, SNApiService, findInArray, isNullOrUndefined, deepMerge, extendArray, removeFromIndex, subtractFromArray, arrayByDifference, uniqCombineObjArrays, greaterOfTwoDates, ENCRYPTION_INTENT_LOCAL_STORAGE_DECRYPTED, ENCRYPTION_INTENT_LOCAL_STORAGE_ENCRYPTED, ENCRYPTION_INTENT_LOCAL_STORAGE_PREFER_ENCRYPTED, ENCRYPTION_INTENT_FILE_DECRYPTED, ENCRYPTION_INTENT_FILE_ENCRYPTED, ENCRYPTION_INTENT_SYNC, isLocalStorageIntent, isFileIntent, isDecryptedIntent, intentRequiresEncryption, CONTENT_TYPE_ROOT_KEY, CONTENT_TYPE_ITEMS_KEY, CONTENT_TYPE_ENCRYPTED_STORAGE, CONTENT_TYPE_NOTE, CONTENT_TYPE_TAG, CONTENT_TYPE_USER_PREFS, CONTENT_TYPE_COMPONENT, CONTENT_TYPE_PRIVILEGES, ApplicationEvents, Environments, Platforms, isEnvironmentWebOrDesktop, isEnvironmentMobile, SYNC_EVENT_FULL_SYNC_COMPLETED, SNPureItemPayload, SNStorageItemPayload, PayloadCollection, CreateMaxPayloadFromAnyObject, CreateSourcedPayloadFromObject, PAYLOAD_SOURCE_REMOTE_RETRIEVED, PAYLOAD_SOURCE_REMOTE_SAVED, PAYLOAD_SOURCE_LOCAL_SAVED, PAYLOAD_SOURCE_LOCAL_RETRIEVED, PAYLOAD_SOURCE_LOCAL_DIRTIED, PAYLOAD_SOURCE_COMPONENT_RETRIEVED, PAYLOAD_SOURCE_DESKTOP_INSTALLED, PAYLOAD_SOURCE_REMOTE_ACTION_RETRIEVED, PAYLOAD_SOURCE_FILE_IMPORT, isPayloadSourceRetrieved, PAYLOAD_CONTENT_FORMAT_ENCRYPTED_STRING, PAYLOAD_CONTENT_FORMAT_DECRYPTED_BARE_OBJECT, PAYLOAD_CONTENT_FORMAT_DECRYPTED_BASE_64_STRING, STORAGE_KEY_ROOT_KEY_PARAMS, STORAGE_KEY_MOBILE_PASSCODE_TIMING, BaseMigration, ProtectedActions, PRIVILEGE_CREDENTIAL_ACCOUNT_PASSWORD, PRIVILEGE_CREDENTIAL_LOCAL_PASSCODE, PRIVILEGE_SESSION_LENGTH_NONE, PRIVILEGE_SESSION_LENGTH_FIVE_MINUTES, PRIVILEGE_SESSION_LENGTH_ONE_HOUR, PRIVILEGE_SESSION_LENGTH_ONE_WEEK */
/***/ (function(module, exports) {

throw new Error("Module build failed (from ./node_modules/babel-loader/lib/index.js):\nSyntaxError: /Users/mo/Desktop/sn/dev/snjs/lib/main.js: Unexpected token, expected \",\" (85:14)\n\n\u001b[0m \u001b[90m 83 | \u001b[39m\u001b[36mexport\u001b[39m {\u001b[0m\n\u001b[0m \u001b[90m 84 | \u001b[39m  \u001b[33mCONTENT_TYPE_ROOT_KEY\u001b[39m\u001b[33m,\u001b[39m\u001b[0m\n\u001b[0m\u001b[31m\u001b[1m>\u001b[22m\u001b[39m\u001b[90m 85 | \u001b[39m  \u001b[33mContentTypes\u001b[39m\u001b[33m.\u001b[39m\u001b[33mItemS_KEY\u001b[39m\u001b[33m,\u001b[39m\u001b[0m\n\u001b[0m \u001b[90m    | \u001b[39m              \u001b[31m\u001b[1m^\u001b[22m\u001b[39m\u001b[0m\n\u001b[0m \u001b[90m 86 | \u001b[39m  \u001b[33mCONTENT_TYPE_ENCRYPTED_STORAGE\u001b[39m\u001b[33m,\u001b[39m\u001b[0m\n\u001b[0m \u001b[90m 87 | \u001b[39m  \u001b[33mCONTENT_TYPE_NOTE\u001b[39m\u001b[33m,\u001b[39m\u001b[0m\n\u001b[0m \u001b[90m 88 | \u001b[39m  \u001b[33mCONTENT_TYPE_TAG\u001b[39m\u001b[33m,\u001b[39m\u001b[0m\n    at Object.raise (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:6983:17)\n    at Object.unexpected (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:8376:16)\n    at Object.expect (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:8362:28)\n    at Object.parseExportSpecifiers (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:11983:14)\n    at Object.maybeParseExportNamedSpecifiers (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:11788:36)\n    at Object.parseExport (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:11727:32)\n    at Object.parseStatementContent (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:10770:27)\n    at Object.parseStatement (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:10666:17)\n    at Object.parseBlockOrModuleBlockBody (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:11242:25)\n    at Object.parseBlockBody (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:11229:10)\n    at Object.parseTopLevel (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:10597:10)\n    at Object.parse (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:12107:10)\n    at parse (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/parser/lib/index.js:12158:38)\n    at parser (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/core/lib/transformation/normalize-file.js:168:34)\n    at normalizeFile (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/core/lib/transformation/normalize-file.js:102:11)\n    at runSync (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/core/lib/transformation/index.js:44:43)\n    at runAsync (/Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/core/lib/transformation/index.js:35:14)\n    at /Users/mo/Desktop/sn/dev/snjs/node_modules/@babel/core/lib/transform.js:34:34\n    at processTicksAndRejections (internal/process/task_queues.js:79:11)");

/***/ })

/******/ });
});
//# sourceMappingURL=snjs.js.map