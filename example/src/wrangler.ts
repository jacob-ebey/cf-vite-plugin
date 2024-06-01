export { Counter } from "./counter.js";

type Env = {
  COUNTER: DurableObjectNamespace;
};

export default {
  fetch(
    request: Request & {
      cf?: IncomingRequestCfProperties;
    },
    env: Env
  ) {
    const id = request.cf?.country || "global";
    const counter = env.COUNTER.get(env.COUNTER.idFromName(id));
    return counter.fetch(request);
  },
} satisfies ExportedHandler<Env>;
