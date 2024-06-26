import type { Counter } from "./durable-objects/counter.js";

export type Env = {
  COOKIE_SECRET: string;
  COUNTER: DurableObjectNamespace;
  COUNTER_KV: KVNamespace;
  SERVER_COMPONENTS: DurableObjectNamespace;
  __STATIC_CONTENT?: KVNamespace;
};
