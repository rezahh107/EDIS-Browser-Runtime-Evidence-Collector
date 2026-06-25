# Expected reviewer results

- The package loads as Manifest V3 and registers a service worker.
- Popup, side panel, options, English, and Persian resources load from the extension package.
- No capture begins merely by visiting a page.
- A user-triggered capture on an HTTP or HTTPS page creates local JSON evidence.
- Screenshot and text preview remain absent unless explicitly enabled.
- Export creates a local ZIP with schemas, canonical JSON, checksums, and a package manifest.
- The page DOM remains unchanged.
- No extension-originated external request occurs.
- Restricted pages fail clearly without a false completed snapshot.
