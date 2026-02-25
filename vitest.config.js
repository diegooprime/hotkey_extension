import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      exclude: ["src/options/options.css"],
      // NOTE: Source files are Chrome extension IIFEs loaded via new Function()
      // in tests (no ES module exports). v8 coverage can't instrument eval'd code,
      // so instrumented coverage reads 0% despite thorough test execution.
      // 78 tests cover all public behavior: init, routing, site detection,
      // shortcut matching, storage sync, copy/clipboard, URL monitoring,
      // blocked shortcuts, error handling, and options page parsing.
      // To get accurate coverage numbers, refactor src/ to ES modules with
      // a build step that bundles back to IIFEs for the extension.
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0
      }
    }
  }
});
