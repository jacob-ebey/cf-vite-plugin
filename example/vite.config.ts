import path from "node:path";

import { createMiddleware } from "@hattip/adapter-node/native-fetch";
import cloudflare, {
  type WorkerdDevEnvironment,
} from "@jacob-ebey/cf-vite-plugin";
import serverComponents, {
  rscSingleton,
} from "@jacob-ebey/hono-server-components/vite";
import { preact } from "@preact/preset-vite";
import type { Rollup } from "vite";
import { defineConfig } from "vite";
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

export default defineConfig(({ command }) => ({
  builder: {
    async buildApp(builder) {
      let clientModules = rscSingleton.clientModules.size;
      do {
        clientModules = rscSingleton.clientModules.size;
        clientBuildPromise = builder.build(builder.environments.client);
        await builder.build(builder.environments.prerender);
        await builder.build(builder.environments.server);
        await clientBuildPromise;
      } while (clientModules !== rscSingleton.clientModules.size);
    },
  },
  environments: {
    client: {
      build: {
        assetsInlineLimit: 0,
        manifest: true,
        outDir: "dist/browser",
        rollupOptions: {
          input: [
            "/src/browser.tsx",
            "/src/global.css",
            "virtual:client-modules",
          ],
          preserveEntrySignatures: "exports-only",
        },
      },
    },
    prerender: {
      nodeCompatible: true,
      webCompatible: true,
      build: {
        emptyOutDir: true,
        outDir: "dist/prerender",
        assetsInlineLimit: 0,
        target: "ESNext",
        rollupOptions: {
          preserveEntrySignatures: "exports-only",
          input: ["/src/worker.ts", "virtual:client-modules"],
        },
      },
      resolve: {
        mainFields: ["module"],
        conditions: ["workerd", "module"],
        noExternal: command !== "build" ? true : undefined,
        external:
          command !== "build" ? ["@cloudflare/kv-asset-handler"] : undefined,
      },
    },
    server: {
      nodeCompatible: true,
      webCompatible: true,
      build: {
        emptyOutDir: true,
        outDir: "dist/server",
        assetsInlineLimit: 0,
        target: "ESNext",
        rollupOptions: {
          preserveEntrySignatures: "exports-only",
          input: {
            "durables/counter": "/src/durable-objects/counter.ts",
            "durables/server-components":
              "/src/durable-objects/server-components.tsx",
          },
        },
      },
      resolve: {
        mainFields: ["module"],
        conditions: ["workerd", "module"],
        noExternal: command !== "build" ? true : undefined,
        external:
          command !== "build" ? ["@cloudflare/kv-asset-handler"] : undefined,
      },
    },
  },
  plugins: [
    serverComponents({
      serverEnvironments: ["server"],
    }),
    preact({
      devToolsEnabled: false,
      prefreshEnabled: false,
      reactAliasesEnabled: false,
      jsxImportSource: "hono/jsx",
    }),
    cloudflare({
      environments: ["prerender", "server"],
      persist: true,
      wrangler: {
        configPath: "./wrangler.dev.toml",
      },
      durableObjects: {
        COUNTER: {
          environment: "server",
          file: "/src/durable-objects/counter.ts",
        },
        SERVER_COMPONENTS: {
          environment: "server",
          file: "/src/durable-objects/server-components.tsx",
        },
      },
    }),
    {
      name: "dev-server",
      configureServer(server) {
        const devEnv = server.environments.prerender as WorkerdDevEnvironment;

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
}));
