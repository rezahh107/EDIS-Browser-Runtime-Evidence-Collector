export default class ForceExitAfterReport {
  onTestRunEnd() {
    setTimeout(() => {
      process.exit(process.exitCode ?? 0);
    }, 2_000);
  }
}
