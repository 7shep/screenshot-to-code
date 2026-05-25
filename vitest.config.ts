import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Allow NodeNext-style .js imports to resolve to .ts source files during tests
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  test: {
    environment: "node",
  },
});
