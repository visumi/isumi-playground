import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["apps/api/test/**/*.spec.ts"],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "apps/api/wrangler.jsonc"
        }
      }
    }
  }
});
