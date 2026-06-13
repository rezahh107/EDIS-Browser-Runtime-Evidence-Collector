# STRIDE Threat Model

## Threats
S: Spoofing → validate sender/tab
T: Tampering → checksum & immutability
R: Repudiation → requestId tracking
I: Information disclosure → redaction
D: Denial of service → element limits
E: Elevation → minimal permissions

## Trust Boundaries
- Browser ↔ Extension
- Content script ↔ Service worker