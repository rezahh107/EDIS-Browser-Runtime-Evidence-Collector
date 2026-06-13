# Chrome Web Store Reviewer Guide

## Purpose
Local runtime evidence collection only.

## Permissions
- activeTab → user triggered capture
- scripting → DOM measurement
- storage → local persistence
- sidePanel → UI workflow

## No External Communication
This extension does NOT:
- send data to servers
- use analytics
- load remote scripts

## Testing Steps
1. Load unpacked
2. Open page
3. Click Capture
4. Verify snapshot JSON