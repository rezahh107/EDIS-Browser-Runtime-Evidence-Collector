# Performance Validation — Browser 1.6.11

## Evidence status

```yaml
benchmark_environment: Node.js 22.16.0 and jsdom test environment
browser_runtime_profile: insufficient_evidence
comparison_source: unchanged 1.6.10 source archive versus 1.6.11 source
```

## ZIP benchmark

The real `createStoreZip` implementation was bundled separately from each source tree and executed with one STORE entry. Input allocation occurred before the measured interval. `array_buffer_delta` is the additional `process.memoryUsage().arrayBuffers` observed while the ZIP result remained live.

| Payload | 1.6.10 time | 1.6.11 time | Time change | 1.6.10 buffer delta | 1.6.11 buffer delta | Buffer change |
| ------: | ----------: | ----------: | ----------: | ------------------: | ------------------: | ------------: |
|  16 MiB |   732.96 ms |   548.88 ms |      -25.1% |        50,331,959 B |        16,777,347 B |        -66.7% |
|  32 MiB | 1,514.29 ms | 1,049.09 ms |      -30.7% |        83,886,391 B |        33,554,563 B |        -60.0% |
|  60 MiB | 2,751.95 ms | 1,910.56 ms |      -30.6% |       188,743,991 B |        62,914,691 B |        -66.7% |

The 60 MiB case is below the existing 64,000,000-byte per-entry safety limit. The benchmark does not include Worker startup, Blob creation, download behavior, or browser memory accounting.

## Capture regression gate

`tests/integration/performanceCaching.test.ts` creates an 80-element synthetic Elementor-like DOM and shares one `CaptureMeasurementContext` across selection and collection. The test requires total `getComputedStyle` calls to remain no greater than the total number of elements in the document while geometry, visibility, relationships, and computed-style evidence are all collected.

This gate verifies cache reuse and guards against reintroducing the multi-read pattern. It does not substitute for Chrome or Edge Performance/Memory profiling.

## Remaining evidence gap

```yaml
status: insufficient_evidence
missing_evidence:
  - Chrome Performance trace on a real large Elementor page
  - Chrome or Edge heap and ArrayBuffer peak profile during a near-limit export
  - Real Source Context fixture near 50,000 records
  - Interrupted Service Worker recovery profile with a large IndexedDB chunk store
affected_conclusion:
  - exact browser speedup
  - exact browser peak-memory reduction
  - long-task duration on production pages
partial_processing_possible: true
```
