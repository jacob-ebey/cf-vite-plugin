import { Env } from "./env.js";

export class Counter implements DurableObject {
  #env: Env;
  #state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.#state = state;
    this.#env = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    switch (`${request.method} ${url.pathname}`) {
      case "GET /value":
        return new Response(String(await this.#getCounterValue()));
      case "GET /increment":
      case "POST /increment":
        return new Response(String(await this.#increment()));
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  async #getCounterValue() {
    const value =
      (await this.#env.COUNTER_KV.get<number>("value", "json")) || 0;
    return value;
  }

  async #increment(amount = 1) {
    let value = (await this.#env.COUNTER_KV.get<number>("value", "json")) || 0;
    value += amount;
    await this.#env.COUNTER_KV.put("value", String(value));
    // await this.#state.storage.put("value", value);
    return value;
  }
}
