# Architecture

## Layers

Presentation:
- Popup
- Side panel
- Options

Application:
- Service worker
- Capture orchestrator
- Session manager

Domain:
- Snapshot
- Element model
- Viewport descriptor

Infrastructure:
- Storage (IndexedDB)
- Browser APIs (adapter layer)

## Data Flow
User action → Service worker → Content script → Snapshot → Storage → Export