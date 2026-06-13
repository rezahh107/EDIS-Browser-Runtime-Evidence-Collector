# Compatibility Matrix

| Target | Status | Background model | Primary workflow |
| --- | --- | --- | --- |
| Chrome | Production target | Manifest V3 service worker | Side panel with popup entry |
| Microsoft Edge | Production target | Manifest V3 service worker | Side panel with popup entry |
| Firefox | Experimental architecture target | Manifest V3 non-persistent event script | Sidebar or extension-page fallback |

Firefox production compatibility is not claimed. Its background model differs from Chromium service workers, and dedicated build, permission, screenshot, storage, sidebar, and end-to-end verification is required before release.
