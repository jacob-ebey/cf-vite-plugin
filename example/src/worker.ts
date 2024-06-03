import { rscConsumer } from "@jacob-ebey/hono-server-components";
import { Hono } from "hono";

import clientModules from "virtual:client-modules";

import { durableObjectsMiddleware } from "./durable-objects.js";
import type { Env } from "./env.js";

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>().use(durableObjectsMiddleware).use(
  rscConsumer<HonoEnv>({
    fetchRSC({ env: { SERVER_COMPONENTS }, req }) {
      const stub = SERVER_COMPONENTS.get(
        SERVER_COMPONENTS.idFromName("global")
      );

      return stub.fetch(req.raw);
    },
    loadClientModule: import.meta.env.PROD
      ? (id) => {
          return clientModules[id]();
        }
      : undefined,
  })
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (
      import.meta.env.PROD &&
      env.__STATIC_CONTENT &&
      url.pathname.startsWith("/assets/")
    ) {
      try {
        const [{ default: manifestJSON }, { getAssetFromKV }] =
          await Promise.all([
            import("__STATIC_CONTENT_MANIFEST"),
            import("@cloudflare/kv-asset-handler"),
          ]);
        const assetManifest = JSON.parse(manifestJSON);
        return await getAssetFromKV(
          {
            request,
            waitUntil: ctx.waitUntil.bind(ctx),
          },
          {
            ASSET_NAMESPACE: env.__STATIC_CONTENT,
            ASSET_MANIFEST: assetManifest,
            cacheControl: {
              // 1 minute
              browserTTL: 60,
              // 1 day
              edgeTTL: 86400, 
            }
          }
        );
      } catch (e) {}
    }

    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
