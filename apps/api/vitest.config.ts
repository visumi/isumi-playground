import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "apps/api/wrangler.jsonc"
      }
    })
  ],
  test: {
    include: ["apps/api/test/**/*.spec.ts"]
  }
});
