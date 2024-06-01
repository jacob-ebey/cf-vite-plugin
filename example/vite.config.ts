import path from "node:path";

import type { Rollup } from "vite";
import { defineConfig } from "vite";

import { createMiddleware } from "@hattip/adapter-node/native-fetch";
import cloudflare, {
  type WorkerdDevEnvironment,
} from "@jacob-ebey/cf-vite-plugin";
import react from "@vitejs/plugin-react";
import { unstable_getMiniflareWorkerOptions } from "wrangler";

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
        manifest: true,
        outDir: "dist/browser",
        rollupOptions: {
          input: ["/src/browser.tsx", "/src/global.css"],
        },
      },
    },
    workerd: {
      build: {
        emptyOutDir: true,
        outDir: "dist/workerd",
        assetsInlineLimit: 0,
      },
      resolve: {
        mainFields: ["module"],
        conditions: ["workerd", "module"],
        noExternal: true,
        external: ["@cloudflare/kv-asset-handler"],
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
      name: "bridged-assets",
      async resolveId(id, importer) {
        if (id.startsWith("bridge:")) {
          if (!this.environment?.config.ssr) {
            throw new Error("Cannot bridge assets from a client build.");
          }

          const baseId = id.slice("bridge:".length);
          const postfix = this.environment.config.command !== "build" ? "" : "";
          const resolved = await this.resolve(baseId + postfix, importer, {
            skipSelf: true,
          });
          if (!resolved) {
            throw new Error(`Could not resolve asset: ${baseId}`);
          }

          // The # is to stop vite from trying to transform the asset.
          return `\0bridge:${resolved.id}#`;
        }
      },
      async load(id) {
        if (id.startsWith("\0bridge:") && id.endsWith("#")) {
          if (!this.environment?.config.ssr) {
            throw new Error("Cannot bridge assets from a client build.");
          }
          const baseId = id.slice("\0bridge:".length, -1);
          const relative = path
            .relative(this.environment.config.root, baseId)
            .replace(/\\/g, "/");

          if (this.environment.config.command !== "build") {
            return `export default "/${relative}";`;
          }

          if (!clientBuildPromise) {
            throw new Error("Client build promise not set.");
          }
          const clientBuildResults = await clientBuildPromise;
          const clientBuild = clientBuildResults as Rollup.RollupOutput;

          const manifest = clientBuild.output.find(
            (o) => o.fileName === ".vite/manifest.json"
          );
          if (
            !manifest ||
            !("source" in manifest) ||
            typeof manifest.source !== "string"
          ) {
            throw new Error("Could not find client manifest.");
          }
          const manifestJson = JSON.parse(manifest.source);
          let manifestFile = manifestJson[relative]?.file as string | undefined;

          if (!manifestFile) {
            const output = clientBuild.output.find(
              (o) => "facadeModuleId" in o && o.facadeModuleId === baseId
            );
            if (!output) {
              throw new Error(`Could not find browser output for ${baseId}`);
            }
            manifestFile = output.fileName;
          }

          return `export default "${this.environment.config.base}${manifestFile}";`;
        }
      },
    },
  ],
});
