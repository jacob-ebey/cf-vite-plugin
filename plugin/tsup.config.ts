import { defineConfig } from "tsup";

export default [
  defineConfig({
    entry: ["src/durable-object-runner.ts"],
    format: ["esm"],
    platform: "browser",
    noExternal: [/.*/],
  }),
  defineConfig({
    entry: ["src/runner.ts"],
    format: ["esm"],
    platform: "browser",
    noExternal: [/.*/],
  }),
  defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    platform: "node",
    dts: true,
    external: ["vite", "miniflare", "wrangler"],
  }),
];
