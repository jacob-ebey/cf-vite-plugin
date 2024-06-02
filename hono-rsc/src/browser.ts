import { rscStream } from "rsc-html-stream/client";
import { decode } from "@jacob-ebey/hono-server-components/runtime";

export const rootPromise = decode(rscStream, {
  loadClientModule(id) {
    return import(/* @vite-ignore */ id);
  },
}).then((decoded) => decoded);
