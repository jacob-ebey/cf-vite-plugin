import app from "./app.js";
import type { Env } from "./env.js";

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
          }
        );
      } catch (e) {}
    }

    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
