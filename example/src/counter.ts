import { Hono } from "hono";

import { Env } from "./env.js";

const app = new Hono<{ Bindings: Env & { state: DurableObjectState } }>()
  .get("/value", async ({ env: { COUNTER_KV }, json }) => {
    const value = (await COUNTER_KV.get<number>("value", "json")) || 0;
    return json(value);
  })
  .post("/increment", async ({ env: { COUNTER_KV }, json }) => {
    const value = (await COUNTER_KV.get<number>("value", "json")) || 0;
    const newValue = value + 1;
    await COUNTER_KV.put("value", newValue.toString());
    return json(newValue);
  });

export class Counter implements DurableObject {
  #env: Env;
  #state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.#state = state;
    this.#env = env;
  }

  async fetch(request: Request) {
    return app.fetch(request, {
      ...this.#env,
      state: this.#state,
    });
  }
}

export type CounterAPI = typeof app;
