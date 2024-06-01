import { defineConfig } from "vite";

import { createMiddleware } from "@hattip/adapter-node/native-fetch";
import cloudflare, {
  type WorkerdDevEnvironment,
} from "@jacob-ebey/cf-vite-plugin";

const entry = "/src/wrangler.ts";

export default defineConfig({
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.workerd);
    },
  },
  environments: {
    workerd: {
      build: {
        rollupOptions: {
          input: entry,
        },
      },
    },
  },
  plugins: [
    cloudflare({
      environment: "workerd",
      persist: true,
      wrangler: {
        configPath: "./wrangler.dev.toml",
      },
    }),
    {
      name: "dev-server",
      configureServer(server) {
        const devEnv = server.environments.workerd as WorkerdDevEnvironment;

        const nodeMiddleware = createMiddleware(
          (ctx) => devEnv.api.dispatchFetch(entry, ctx.request),
          { alwaysCallNext: false }
        );

        return () => {
          server.middlewares.use((req, res, next) => {
            req.url = req.originalUrl;
            return nodeMiddleware(req, res, next);
          });
        };
      },
    },
  ],
});
