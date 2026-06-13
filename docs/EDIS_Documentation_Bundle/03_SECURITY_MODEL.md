# Security Model

## Principles
- No remote code
- No eval / Function constructor
- No telemetry
- Minimal permissions

## Threat Model (STRIDE)
- Spoofing → message validation
- Tampering → checksum verification
- DoS → DOM limits
- Info leak → redaction policy

## Forbidden APIs
- cookies
- history
- debugger
- webRequest