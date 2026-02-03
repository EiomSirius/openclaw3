#!/usr/bin/env node

const warningFilterKey = Symbol.for("openclaw.warning-filter");
if (!globalThis[warningFilterKey]?.installed) {
  globalThis[warningFilterKey] = { installed: true };
  // Remove Node.js default warning handler to prevent it from printing before we filter
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.code === "DEP0040" && warning.message?.includes("punycode")) return;
    if (warning.code === "DEP0060" && warning.message?.includes("util._extend")) return;
    if (warning.name === "ExperimentalWarning" && warning.message?.includes("SQLite")) return;
    process.stderr.write(`${warning.stack ?? warning.toString()}\n`);
  });
}

import module from "node:module";

// https://nodejs.org/api/module.html#module-compile-cache
if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

await import("./dist/entry.js");
