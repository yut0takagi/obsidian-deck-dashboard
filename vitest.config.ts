import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "./tests/__mocks__/obsidian.ts"),
    },
  },
});
