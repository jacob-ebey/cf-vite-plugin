import path from "node:path";

import type { Rollup } from "vite";
import { defineConfig } from "vite";

import { createMiddleware } from "@hattip/adapter-node/native-fetch";
import cloudflare, {
  type WorkerdDevEnvironment,
} from "@jacob-ebey/cf-vite-plugin";
import react from "@vitejs/plugin-react";
import { unstable_getMiniflareWorkerOptions } from "wrangler";

const browserEntry = "/src/browser.tsx";

const { main } = unstable_getMiniflareWorkerOptions("wrangler.dev.toml");
if (!main) {
  throw new Error("Missing main in wrangler.dev.toml");
}

declare global {
  var clientBuildPromise:
    | Promise<
        Rollup.RollupOutput | Rollup.RollupOutput[] | Rollup.RollupWatcher
      >
    | undefined;
}

global.clientBuildPromise = global.clientBuildPromise || undefined;

export default defineConfig({
  builder: {
    async buildApp(builder) {
      clientBuildPromise = builder.build(builder.environments.client);
      await builder.build(builder.environments.workerd);
    },
  },
  environments: {
    client: {
      build: {
        assetsInlineLimit: 0,
        outDir: "dist/browser",
        rollupOptions: {
          input: browserEntry,
        },
      },
    },
    workerd: {
      build: {
        emptyOutDir: true,
        outDir: "dist/workerd",
      },
      // dev: {
      //   optimizeDeps: {
      //     // include: ["@cloudflare/kv-asset-handler"],
      //   },
      // },
      resolve: {
        mainFields: ["module"],
        conditions: ["workerd", "module"],
        noExternal: true,
        external: ["@cloudflare/kv-asset-handler"]
      },
    },
  },
  plugins: [
    react({
      jsxRuntime: "automatic",
      jsxImportSource: "hono/jsx",
    }),
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
          (ctx) => devEnv.api.dispatchFetch(main, ctx.request),
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
    {
      name: "virtual-assets",
      async resolveId(id, importer) {
        if (id.startsWith("asset:")) {
          if (this.environment?.config.command !== "build") {
            return `\0${id}`;
          }
          const baseId = id.slice("asset:".length);
          const resolved = await this.resolve(baseId, importer, {
            skipSelf: true,
          });
          if (!resolved) {
            throw new Error(`Could not resolve asset: ${baseId}`);
          }

          return `\0asset:${resolved.id}`;
        }

        if (id === "__STATIC_CONTENT_MANIFEST") {
          return {
            id,
            external: true,
          };
        }
      },
      async load(id) {
        if (id.startsWith("\0asset:")) {
          if (!this.environment?.config.ssr) {
            throw new Error(
              "Asset imports are only supported in a server environment. Enable 'ssr' in your vite environment config."
            );
          }

          const baseId = id.slice("\0asset:".length);
          if (this.environment.config.command !== "build") {
            return `export default "${id.slice("\0asset:".length)}";`;
          }

          if (!clientBuildPromise) {
            throw new Error("Client build promise not set.");
          }
          const clientBuildResults = await clientBuildPromise;
          const clientBuild = clientBuildResults as Rollup.RollupOutput;

          console.log({ baseId });
          const output = clientBuild.output.find(
            (o) => "facadeModuleId" in o && o.facadeModuleId === baseId
          );
          if (!output) {
            throw new Error(`Could not find browser output for ${baseId}`);
          }
          const publicPath = this.environment.config.base;
          return `export default "${publicPath}${output.fileName}";`;
        }
      },
    },
  ],
});
