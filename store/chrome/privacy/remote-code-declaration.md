# Remote-code declaration

The extension executes only code bundled in the submitted package. It contains no remotely hosted JavaScript or WebAssembly, no dynamic code loader, no `eval`, no `new Function`, no string-based timers, no external scripts, and no remote module imports.

The extension Content Security Policy permits scripts only from the extension package and disables objects and base-URI changes.
