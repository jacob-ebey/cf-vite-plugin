import { rscConsumer } from "@jacob-ebey/hono-server-components";
import { Hono } from "hono";

import clientModules from "virtual:client-modules";

import { durableObjectsMiddleware } from "./durable-objects.js";
import type { Env } from "./env.js";
import type { SessionVariables } from "./session.js";
import { sessionMiddleware } from "./session.js";

type HonoEnv = { Bindings: Env; Variables: SessionVariables };

const app = new Hono<HonoEnv>()
  .use(sessionMiddleware)
  .use(durableObjectsMiddleware)
  .use(
    rscConsumer<HonoEnv>({
      fetchRSC({ env: { SERVER_COMPONENTS }, get, req }) {
        const stub = SERVER_COMPONENTS.get(
          SERVER_COMPONENTS.idFromName(get("sessionId"))
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
        const ext = url.pathname.split(".").pop();
        return await getAssetFromKV(
          {
            request,
            waitUntil: ctx.waitUntil.bind(ctx),
          },
          {
            ASSET_NAMESPACE: env.__STATIC_CONTENT,
            ASSET_MANIFEST: assetManifest,
            cacheControl: [".css", ".js"].includes(ext || "")
              ? {
                  // 1 year
                  browserTTL: 31536000,
                  edgeTTL: 31536000,
                }
              : {
                  // 1 minute
                  browserTTL: 60,
                  edgeTTL: 60,
                },
          }
        );
      } catch (e) {}
    }

    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
