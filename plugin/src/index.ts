import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DefaultMap, tinyassert, isNotNil } from "@hiogawa/utils";
import type { WorkerOptions } from "miniflare";
import {
  mergeWorkerOptions,
  Miniflare,
  Response as MiniflareResponse,
  WebSocket,
} from "miniflare";
import { unstable_getMiniflareWorkerOptions } from "wrangler";
import type {
  CustomPayload,
  HotChannel,
  PluginOption,
  ResolvedConfig,
} from "vite";
import { DevEnvironment } from "vite";

import type { EvalApi, EvalMetadata, RunnerFetchMetadata } from "./shared.js";
import { ANY_URL, RUNNER_EVAL_PATH, RUNNER_INIT_PATH } from "./shared.js";

export type CloudflareVitePluginOptions = {
  environment: string;
  persist?: boolean;
  worker?: WorkerOptions;
  wrangler?: {
    configPath?: string;
  };
};

type WranglerOptions = ReturnType<typeof unstable_getMiniflareWorkerOptions>;

export default function cloudflareVitePlugin(
  options: CloudflareVitePluginOptions
): PluginOption {
  const wranglerOptions = unstable_getMiniflareWorkerOptions(
    options.wrangler?.configPath || "wrangler.toml"
  );

  const entry = wranglerOptions.main;
  if (!entry) {
    throw new Error(
      `wrangler.toml does not have a main entry. Please add a main entry to wrangler.toml`
    );
  }

  return {
    name: "cloudflare-vite-plugin",
    configEnvironment(name, config, env) {
      if (name === options.environment) {
        return {
          build: {
            ssr: true,
            rollupOptions: {
              input: entry,
            },
          },
          dev: {
            createEnvironment: (name, config) =>
              createWorkerdDevEnvironment(
                name,
                config,
                options,
                wranglerOptions
              ),
          },
        };
      }
    },
  };
}

export type WorkerdDevApi = {
  dispatchFetch(entry: string, request: Request): Promise<Response>;
  eval: EvalApi;
};

export type WorkerdDevEnvironment = DevEnvironment & {
  api: WorkerdDevApi;
};

async function createWorkerdDevEnvironment(
  name: string,
  config: ResolvedConfig,
  options: CloudflareVitePluginOptions,
  wranglerOptions: WranglerOptions
): Promise<WorkerdDevEnvironment> {
  const entry = wranglerOptions.main;
  if (!entry) {
    throw new Error(
      `wrangler.toml does not have a main entry. Please add a main entry to wrangler.toml`
    );
  }

  const {
    bindings,
    d1Databases,
    durableObjects,
    kvNamespaces,
    r2Buckets,
    serviceBindings,
    ...workerOptions
  } = wranglerOptions.workerOptions;

  let baseRunnerOptions: Partial<WorkerOptions> = options.worker ?? {
    modulesRoot: "/",
    unsafeEvalBinding: "__viteUnsafeEval",
    d1Databases,
    kvNamespaces,
    bindings: {
      ...bindings,
      __viteRoot: config.root,
    },
    serviceBindings: {
      ...serviceBindings,
      __viteFetchModule: async (request) => {
        const args = await request.json();
        try {
          const result = await devEnv.fetchModule(...(args as [any, any]));
          return new MiniflareResponse(JSON.stringify(result));
        } catch (error) {
          console.error("[fetchModule]", args, error);
          throw error;
        }
      },
    },
  };

  const workerDurableObjects = Object.fromEntries(
    Object.entries(durableObjects ?? {})
      .map(([binding, durableObjectConfig]) => {
        if (
          typeof durableObjectConfig !== "object" ||
          !durableObjectConfig ||
          durableObjectConfig?.scriptName
        ) {
          return null;
        }
        return [
          binding,
          {
            className: "DurableObjectRunnerObject",
            scriptName: `vite-durable-object-runner-${binding}`,
          },
        ] as const;
      })
      .filter(isNotNil)
  );

  const miniflare = new Miniflare({
    ...workerOptions,
    d1Persist: options.persist,
    kvPersist: options.persist,
    r2Persist: options.persist,
    cachePersist: options.persist,
    // bindings,
    // d1Databases,
    // kvNamespaces,
    // r2Buckets,
    workers: [
      {
        ...baseRunnerOptions,
        name: "vite-runner",
        durableObjects: {
          ...workerDurableObjects,
          __viteRunner: "RunnerObject",
        },
        modules: [
          {
            type: "ESModule",
            path: fileURLToPath(new URL("./runner.js", import.meta.url)),
          },
        ],
      },
      ...Object.entries(durableObjects ?? {})
        .map(([binding, durableObjectConfig]) => {
          if (
            typeof durableObjectConfig !== "object" ||
            !durableObjectConfig ||
            durableObjectConfig?.scriptName
          ) {
            return null;
          }

          const { [binding]: _, ...durableObjectDurableObjects } =
            workerDurableObjects;
          return {
            ...baseRunnerOptions,
            name: `vite-durable-object-runner-${binding}`,
            durableObjects: {
              ...durableObjectDurableObjects,
              [`__viteDORunner${binding}`]: "DurableObjectRunnerObject",
            },
            modules: [
              {
                type: "ESModule",
                // path: fileURLToPath(
                //   new URL("./durable-object-runner.js", import.meta.url)
                // ),
                path: fileURLToPath(
                  new URL("./durable-object-runner.js", import.meta.url)
                ),
                contents: readFileSync(
                  fileURLToPath(
                    new URL("./durable-object-runner.js", import.meta.url)
                  ),
                  "utf-8"
                ).replace("___EXPORTED___", durableObjectConfig.className),
              },
            ],
          } satisfies WorkerOptions;
        })
        .filter(isNotNil),
    ],
  });

  // get durable object singleton
  const VITE_RUNNER = await miniflare.getDurableObjectNamespace(
    "__viteRunner",
    "vite-runner"
  );
  const runnerObject = VITE_RUNNER.get(VITE_RUNNER.idFromName(""));

  // initial request to setup websocket
  const initResponse = await runnerObject.fetch(ANY_URL + RUNNER_INIT_PATH, {
    headers: {
      Upgrade: "websocket",
    },
  });
  tinyassert(initResponse.webSocket);
  const { webSocket } = initResponse;
  webSocket.accept();

  const initDurableObjectsPromises: Promise<WebSocket>[] = [];
  for (const [binding, durableObject] of Object.entries(durableObjects ?? {})) {
    initDurableObjectsPromises.push(
      (async () => {
        const VITE_RUNNER = await miniflare.getDurableObjectNamespace(
          `__viteDORunner${binding}`,
          `vite-durable-object-runner-${binding}`
        );
        const runnerObject = VITE_RUNNER.get(VITE_RUNNER.idFromName(""));

        // initial request to setup websocket
        const initResponse = await runnerObject.fetch(
          ANY_URL + RUNNER_INIT_PATH,
          {
            headers: {
              Upgrade: "websocket",
              "x-vite-fetch": JSON.stringify({ entry }),
            },
          }
        );

        tinyassert(initResponse.webSocket);
        const { webSocket } = initResponse;
        webSocket.accept();

        return webSocket;
      })()
    );
  }

  const durableObjectsWebSockets = await Promise.all(
    initDurableObjectsPromises
  );

  const hot = createSimpleHMRChannel({
    name,
    post: (data) => {
      webSocket.send(data);
      for (const ws of durableObjectsWebSockets) {
        ws.send(data);
      }
    },
    on: (listener) => {
      webSocket.addEventListener("message", listener);
      for (const ws of durableObjectsWebSockets) {
        ws.addEventListener("message", listener);
      }
      return () => {
        webSocket.removeEventListener("message", listener);
        for (const ws of durableObjectsWebSockets) {
          ws.removeEventListener("message", listener);
        }
      };
    },
    serialize: (v) => JSON.stringify(v),
    deserialize: (v) => JSON.parse(v.data),
  });

  class WorkerdDevEnvironmentImpl extends DevEnvironment {
    override async close() {
      await super.close();
      await miniflare.dispose();
    }
  }

  const devEnv = new WorkerdDevEnvironmentImpl(name, config, { hot });

  const api: WorkerdDevApi = {
    async dispatchFetch(entry: string, request: Request) {
      const headers = new Headers(request.headers);
      headers.set(
        "x-vite-fetch",
        JSON.stringify({ entry } satisfies RunnerFetchMetadata)
      );

      const res = await runnerObject.fetch(request.url, {
        method: request.method,
        headers,
        body: request.body === null ? undefined : (request.body as any),
        redirect: "manual",
        duplex: request.body !== null ? "half" : undefined,
      });
      return new Response(res.body as BodyInit, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers as Headers,
      });
    },

    async eval(ctx) {
      const headers = new Headers();
      headers.set(
        "x-vite-eval",
        JSON.stringify({
          entry: ctx.entry,
          fnString: ctx.fn.toString(),
        } satisfies EvalMetadata)
      );
      const body = JSON.stringify(ctx.data ?? (null as any));
      const fetch_ = runnerObject.fetch as any as typeof fetch; // fix web/undici types
      const response = await fetch_(ANY_URL + RUNNER_EVAL_PATH, {
        method: "POST",
        headers,
        body,
        // @ts-ignore undici
        duplex: "half",
      });
      tinyassert(response.ok);
      const result = await response.json();
      return result as any;
    },
  };

  return Object.assign(devEnv, { api });
}

function createSimpleHMRChannel(options: {
  name: string;
  post: (data: any) => any;
  on: (listener: (data: any) => void) => () => void;
  serialize: (v: any) => any;
  deserialize: (v: any) => any;
}): HotChannel {
  const listerMap = new DefaultMap<string, Set<Function>>(() => new Set());
  let dispose: (() => void) | undefined;

  return {
    // name: options.name,
    listen() {
      dispose = options.on((data) => {
        const payload = options.deserialize(data) as CustomPayload;
        for (const f of listerMap.get(payload.event)) {
          f(payload.data);
        }
      });
    },
    close() {
      dispose?.();
      dispose = undefined;
    },
    on(event: string, listener: (...args: any[]) => any) {
      listerMap.get(event).add(listener);
    },
    off(event: string, listener: (...args: any[]) => any) {
      listerMap.get(event).delete(listener);
    },
    send(...args: any[]) {
      let payload: any;
      if (typeof args[0] === "string") {
        payload = {
          type: "custom",
          event: args[0],
          data: args[1],
        };
      } else {
        payload = args[0];
      }
      options.post(options.serialize(payload));
    },
  };
}
