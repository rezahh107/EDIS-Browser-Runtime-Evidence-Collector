# Installation Guide — EDIS Runtime Collector

## Overview
This guide explains how to install the extension locally and understand distribution modes.

## Installation (Developer Mode)

1. Open Chrome:
   chrome://extensions
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select folder: edis-runtime-collector/

## CRX Packaging (Optional)
Chrome can package extension into CRX for distribution, but requires:
- Extension key
- Signing process
- No direct zip install support

## Troubleshooting
- Manifest missing → verify build output
- Service worker error → reload extension
- Permission denied → ensure activeTab enabled