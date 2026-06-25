# Permission declarations

## `activeTab`

Provides temporary access to the active page only after the user invokes the extension. It avoids persistent host access.

## `scripting`

Injects the bundled one-time collector into the active tab after explicit user action. No persistent content script is registered.

## `storage`

Stores user preferences and transient session coordination in extension-scoped storage. Large evidence uses extension-scoped IndexedDB.

## `sidePanel`

Provides the primary capture-session and export interface in Chrome's side panel.

The extension requests no host permissions and does not request cookies, history, webRequest, debugger, downloads, nativeMessaging, or `<all_urls>` access.
