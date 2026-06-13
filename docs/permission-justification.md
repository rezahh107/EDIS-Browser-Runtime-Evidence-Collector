# Permission Justification

- `activeTab` grants temporary access to the page the user explicitly invoked. Access ends on navigation or tab closure.
- `scripting` injects the transient collector only after capture is requested.
- `storage` stores non-sensitive preferences, interruption-safe job checkpoints, sessions, chunks, snapshots, and optional screenshots.
- `sidePanel` presents the primary staged workflow on supported Chromium browsers. The popup and a normal extension-page fallback preserve core functionality.

No permanent host permission is requested. The broad wildcard host permission commonly rendered as `&lt;all_urls&gt;` is excluded because capture is deliberately limited to the active user-invoked tab. Developer-protocol, history, cookies, web-request, native-messaging, clipboard, geolocation, and management permissions are excluded because version 1.0 does not need them.
