import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".claude/**", ".agentkit/**"],
    // Sequential by default per the project's test principles -- this
    // suite is small and none of these tests need parallelism.
    fileParallelism: false,
  },
});
