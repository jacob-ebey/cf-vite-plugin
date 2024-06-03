import type { Hono, Schema } from "hono";
import type { ClientRequest } from "hono/client";
import { hc } from "hono/client";
import { createMiddleware } from "hono/factory";
import { UnionToIntersection } from "hono/utils/types";

import type { CounterAPI } from "./durable-objects/counter.js";
import type { Env } from "./env.js";
import type { SessionVariables } from "./session.js";

export const durableObjectsMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: SessionVariables & {
    counter: DurableClient<CounterAPI>;
  };
}>(async ({ env: { COUNTER }, get, set }, next) => {
  set(
    "counter",
    createDurableClient<CounterAPI>(
      COUNTER.get(COUNTER.idFromName(get("sessionId")))
    )
  );
  return next();
});

type PathToChain<
  Path extends string,
  E extends Schema,
  Original extends string = ""
> = Path extends `/${infer P}`
  ? PathToChain<P, E, Path>
  : Path extends `${infer P}/${infer R}`
  ? {
      [K in P]: PathToChain<R, E, Original>;
    }
  : {
      [K in Path extends "" ? "index" : Path]: ClientRequest<
        E extends Record<string, unknown> ? E[Original] : never
      >;
    };

type DurableClient<T> = UnionToIntersection<
  T extends Hono<any, infer S, any>
    ? S extends Record<infer K, Schema>
      ? K extends string
        ? PathToChain<K, S>
        : never
      : never
    : never
>;

function createDurableClient<T extends Hono<any, any, any>>(
  durable?: DurableObjectStub<undefined>
) {
  return hc<T>("https://durable-object/", {
    fetch: (info: RequestInfo | URL, init?: RequestInit) => {
      if (!durable) {
        throw new Error("Durable Object not available");
      }
      if (info instanceof URL) {
        info = info.href;
      }
      return durable.fetch(info, init);
    },
  });
}
