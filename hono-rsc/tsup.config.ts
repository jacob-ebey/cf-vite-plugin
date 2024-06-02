import * as fsp from "fs/promises";

import { defineConfig } from "tsup";

export default [
  defineConfig({
    entry: ["src/runtime.ts"],
    format: ["esm"],
    platform: "neutral",
    dts: false,
    external: ["hono/jsx", "hono/utils/html"],
  }),
  defineConfig({
    entry: ["src/runtime.client.ts"],
    format: ["esm"],
    platform: "neutral",
    dts: false,
  }),
  defineConfig({
    entry: ["src/runtime.server.ts"],
    format: ["esm"],
    platform: "neutral",
    dts: false,
  }),
  defineConfig({
    entry: ["src/browser.ts"],
    format: ["esm"],
    platform: "browser",
    dts: false,
    external: ["@jacob-ebey/hono-server-components/runtime"],
  }),
  defineConfig({
    entry: ["src/vite.ts"],
    format: ["esm"],
    platform: "node",
    dts: false,
    external: ["@jacob-ebey/hono-server-components/runtime", "unplugin-rsc"],
  }),
  defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    platform: "neutral",
    dts: false,
    external: [
      "@jacob-ebey/hono-server-components/runtime",
      "hono",
      "hono/factory",
      "hono/html",
      "hono/jsx",
      "hono/jsx-renderer",
      "hono/jsx/streaming",
      "hono/utils/html",
    ],
  }),
];
