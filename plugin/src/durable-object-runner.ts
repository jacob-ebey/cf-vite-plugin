import { tinyassert } from "@hiogawa/utils";
import { ModuleRunner } from "vite/module-runner";

import type { DurableObjectRunnerFetchMetadata, RunnerEnv } from "./shared.js";
import { ANY_URL, RUNNER_INIT_PATH } from "./shared.js";

declare global {
  var runner: undefined | ModuleRunner;
  var options: undefined | DurableObjectRunnerFetchMetadata;
}

globalThis.runner = globalThis.runner || undefined;
globalThis.options = globalThis.options || undefined;

const environment = "___ENVIRONMENT___";
const exported = "___EXPORTED___";

export class DurableObjectRunnerObject implements DurableObject {
  #state: DurableObjectState;
  #env: RunnerEnv;
  // #instanceType?: unknown;
  // #instance?: DurableObject;

  constructor(state: DurableObjectState, env: RunnerEnv) {
    this.#state = state;
    this.#env = env;
  }

  async fetch(request: Request) {
    try {
      return await this.#fetch(request);
    } catch (e) {
      console.error(e);
      let body = "[vite workerd durable object runner error]\n";
      if (e instanceof Error) {
        body += `${e.stack ?? e.message}`;
      }
      return new Response(body, { status: 500 });
    }
  }

  async alarm(): Promise<void> {
    const instance = await this.#getInstance();
    return instance.alarm?.();
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    const instance = await this.#getInstance();
    return instance.webSocketClose?.(ws, code, reason, wasClean);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const instance = await this.#getInstance();
    return instance.webSocketError?.(ws, error);
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    const instance = await this.#getInstance();
    return instance.webSocketMessage?.(ws, message);
  }

  async #getInstance(): Promise<DurableObject> {
    tinyassert(runner, "missing runner");
    tinyassert(options, "missing options");
    const mod = await runner.import(options.entry);
    const CLASS = mod[exported];
    tinyassert(CLASS, `missing durable object class class ${exported}`);
    const instance = new CLASS(this.#state, this.#env);
    return instance;
  }

  async #fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === RUNNER_INIT_PATH) {
      const pair = new WebSocketPair();
      (pair[0] as any).accept();
      tinyassert(!runner);
      runner = createRunner(this.#env, pair[0]);
      options = JSON.parse(
        request.headers.get("x-vite-fetch")!
      ) as DurableObjectRunnerFetchMetadata;
      return new Response(null, { status: 101, webSocket: pair[1] });
    }

    const instance = await this.#getInstance();
    return instance.fetch(request);
  }
}

export function createRunner(env: RunnerEnv, webSocket: WebSocket) {
  return new ModuleRunner(
    {
      root: env.__viteRoot,
      sourcemapInterceptor: "prepareStackTrace",
      transport: {
        fetchModule: async (...args) => {
          const response = await env.__viteFetchModule.fetch(
            new Request(ANY_URL, {
              method: "POST",
              body: JSON.stringify([...args, environment]),
            })
          );
          tinyassert(response.ok);
          const result = response.json();
          return result as any;
        },
      },
      hmr: {
        connection: {
          isReady: () => true,
          onUpdate(callback) {
            webSocket.addEventListener("message", (event) => {
              callback(JSON.parse(event.data));
            });
          },
          send(messages) {
            webSocket.send(JSON.stringify(messages));
          },
        },
      },
    },
    {
      runInlinedModule: async (context, transformed, id) => {
        const codeDefinition = `'use strict';async (${Object.keys(context).join(
          ","
        )})=>{{`;
        const code = `${codeDefinition}${transformed}\n}}`;
        const fn = env.__viteUnsafeEval.eval(code, id);
        await fn(...Object.values(context));
        Object.freeze(context.__vite_ssr_exports__);
      },
      async runExternalModule(filepath) {
        console.log("[runExternalModule]", filepath);
        return import(filepath);
      },
    }
  );
}
