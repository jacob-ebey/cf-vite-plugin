import * as path from "path";

import type { Plugin } from "vite";
import { clientTransform, serverTransform } from "unplugin-rsc";

declare global {
  var rscSingleton: {
    clientModules: Set<string>;
    serverModules: Set<string>;
  };
}

global.rscSingleton = global.rscSingleton ?? {
  clientModules: new Set(),
  serverModules: new Set(),
};

export const rscSingleton = global.rscSingleton;

function virtualModule(id: string) {
  return {
    id,
    resolvedId: `\0${id}`,
    url: `/@id/__x00__${id}`,
  };
}

const virtualClientModules = virtualModule("virtual:client-modules");
const virtualServerModules = virtualModule("virtual:server-modules");

export type ServerComponentsPluginOptions = {
  serverEnvironments: string[];
};

export default function serverComponentsPlugin({
  serverEnvironments,
}: ServerComponentsPluginOptions): Plugin {
  return {
    name: "hono-server-components",
    transform(code, id) {
      if (!this.environment) return;

      const [filepath] = id.split("?");
      const ext = path.extname(filepath);
      if (![".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
        return;
      }

      const hash =
        this.environment.config.command !== "build" ? devHash : prodHash;

      if (serverEnvironments.includes(this.environment.name)) {
        return serverTransform(code, id, {
          id: hash,
          importClient: "registerClientReference",
          importFrom: "@jacob-ebey/hono-server-components/runtime.server",
          importServer: "registerServerReference",
        });
      } else {
        return clientTransform(code, id, {
          id: hash,
          importFrom: "@jacob-ebey/hono-server-components/runtime.client",
          importServer: "registerServerReference",
        });
      }
    },
    resolveId(id) {
      if (id === virtualClientModules.id) {
        return virtualClientModules.resolvedId;
      }
    },
    load(id) {
      if (!this.environment) return;
      const hash =
        this.environment.config.command !== "build" ? devHash : prodHash;

      if (id === virtualClientModules.resolvedId) {
        const r = `export default {
          ${Array.from(rscSingleton.clientModules)
            .map(
              (mod) =>
                `[${JSON.stringify(
                  hash(mod, "use client")
                )}]: () => import(${JSON.stringify(mod)}),`
            )
            .join("\n")}
        };`;
        return r;
      }
    },
  };
}

function prodHash(str: string, type: "use client" | "use server") {
  switch (type) {
    case "use client":
      global.rscSingleton.clientModules.add(str);
      break;
    case "use server":
      global.rscSingleton.serverModules.add(str);
      break;
  }
  return `/${path.relative(process.cwd(), str)}`;
}

function devHash(str: string, type: "use client" | "use server") {
  switch (type) {
    case "use client":
      global.rscSingleton.clientModules.add(str);
      break;
    case "use server":
      global.rscSingleton.serverModules.add(str);
      break;
  }

  const resolved = path.resolve(str);
  let unixPath = resolved.replace(/\\/g, "/");
  if (!unixPath.startsWith("/")) {
    unixPath = `/${unixPath}`;
  }
  if (resolved.startsWith(process.cwd())) {
    return `/${path.relative(process.cwd(), unixPath)}`;
  }
  return `/@fs${unixPath}`;
}
