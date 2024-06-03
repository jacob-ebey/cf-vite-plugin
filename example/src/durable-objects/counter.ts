import { Hono } from "hono";

import { Env } from "../env.js";

const app = new Hono<{ Bindings: Env & { state: DurableObjectState } }>()
  .get("/value", async ({ env: { state }, json }) => {
    const value = (await state.storage.get<number>("value")) || 0;
    return json(value);
  })
  .post("/increment", async ({ env: { state }, json }) => {
    const value = (await state.storage.get<number>("value")) || 0;
    const newValue = value + 1;
    await state.storage.put("value", newValue);
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
