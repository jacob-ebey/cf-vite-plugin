import type { Child, FC, JSXNode } from "hono/jsx";
import { ErrorBoundary, Fragment, Suspense, jsx, use } from "hono/jsx";
import type { HtmlEscapedCallback, HtmlEscapedString } from "hono/utils/html";
import { HtmlEscapedCallbackPhase, raw } from "hono/utils/html";
import * as turbo from "turbo-stream";

function ClientAsyncComponent({
  value,
}: {
  value: Promise<unknown> & {
    result?: unknown;
    error?: unknown;
  };
}) {
  if (value && typeof value.then === "function") {
    return use(value);
  }
  return value;
}
async function ServerAsyncComponent({ value }: { value: Promise<unknown> }) {
  const r = await value;
  return r;
}

const CLIENT_REFERENCE_SYMBOL = Symbol.for("hono.client.reference");
const ERROR_BOUNDARY_SYMBOL = Symbol.for("hono.ErrorBoundary");
const FRAGMENT_SYMBOL = Symbol.for("hono.Fragment");
const SUSPENSE_SYMBOL = Symbol.for("hono.Suspense");

export type DecodeOptions = {
  loadClientModule?(id: string): Promise<Record<string, unknown>>;
};

export function decode(
  readable: ReadableStream<Uint8Array>,
  { loadClientModule }: DecodeOptions = {}
) {
  const clientModuleCache = new Map<string, Promise<Record<string, unknown>>>();
  return turbo.decode(readable, {
    plugins: [
      (pluginType, value, ...promises) => {
        if (pluginType === "e") {
          return {
            value: raw(
              value,
              promises.map<HtmlEscapedCallback>(
                (p) => () => p as Promise<string> | undefined
              )
            ),
          };
        }
      },
      (pluginType, ...inputs: unknown[]) => {
        switch (pluginType) {
          case "j": {
            const [type, key, props] = inputs;
            const { children, ...restProps } = props as Record<string, unknown>;
            let result;
            const pr = {
              ...restProps,
              key,
            };
            const args = Array.isArray(children) ? children : [children];
            if (typeof type === "string") {
              result = jsx(type, pr, ...args);
            } else if (type === FRAGMENT_SYMBOL) {
              result = jsx(Fragment, pr, ...args);
            } else if (type === SUSPENSE_SYMBOL) {
              result = jsx(Suspense, pr, ...args);
            } else if (type === ERROR_BOUNDARY_SYMBOL) {
              result = jsx(ErrorBoundary, pr, ...args);
            }

            if (!result) {
              throw new Error("Invalid JSXNode");
            }

            return { value: result };
          }
          case "a": {
            const [value] = inputs;
            if (
              value &&
              typeof value === "object" &&
              "then" in value &&
              typeof value.then === "function"
            ) {
              if (typeof document !== "undefined") {
                return {
                  value: jsx(ClientAsyncComponent, { value }),
                };
              }
              return {
                value: jsx(ServerAsyncComponent, { value }),
              };
            }
            return {
              value,
            };
          }
          case "c": {
            if (!loadClientModule) {
              throw new Error(
                "loadClientModule is required to decode client references"
              );
            }
            const [key, props, id, name] = inputs as [
              string | number,
              Record<string, unknown>,
              string,
              string
            ];

            const value = clientModuleCache.has(id)
              ? clientModuleCache.get(id)
              : loadClientModule(id).then((mod) => {
                  const Component = mod[name] as FC<{ children: Child }>;
                  const { children, ...restProps } = props as Record<
                    string,
                    unknown
                  >;
                  if (typeof Component !== "function") {
                    console.log(
                      new Error(`Invalid client reference: ${name} (${id})`)
                        .stack
                    );
                    throw new Error(
                      `Invalid client reference: ${name} (${id})`
                    );
                  }
                  return jsx(
                    Component,
                    { ...restProps, key },
                    ...(Array.isArray(children) ? children : [children])
                  );
                });

            if (typeof document !== "undefined") {
              return {
                value: jsx(ClientAsyncComponent, { value }),
              };
            }
            return {
              value: jsx(ServerAsyncComponent, { value }),
            };
          }
          default:
            return false;
        }
      },
    ],
  });
}

export function encode(
  value: unknown,
  { signal }: { signal?: AbortSignal } = {}
) {
  return turbo.encode(value, {
    signal,
    plugins: [
      (value) => {
        if (
          typeof value === "object" &&
          value &&
          value instanceof String &&
          "isEscaped" in value &&
          "callbacks" in value
        ) {
          const escaped = value as HtmlEscapedString;
          return [
            "e",
            String(value),
            ...(escaped.callbacks ?? []).map((cb) =>
              cb({ context: {}, phase: HtmlEscapedCallbackPhase.Stream })
            ),
          ];
        }
        return false;
      },
      (value) => {
        if (
          typeof value !== "object" ||
          (value?.constructor?.name !== "JSXNode" &&
            value?.constructor?.name !== "JSXFunctionNode")
        ) {
          return false;
        }
        const node = value as JSXNode;

        switch (typeof node.type) {
          case "function":
            if (node.type === Fragment) {
              return ["j", FRAGMENT_SYMBOL, node.key, node.props];
            }
            if (node.type === Suspense) {
              return ["j", SUSPENSE_SYMBOL, node.key, node.props];
            }
            if (node.type === ErrorBoundary) {
              return ["j", ERROR_BOUNDARY_SYMBOL, node.key, node.props];
            }
            let result;
            try {
              result = node.type(node.props);
            } catch (reason) {
              result = Promise.reject(reason);
            }

            return ["a", result];
          case "string":
            if (typeof node.type === "function") {
              throw new Error("Cannot encode functional components.... YET ;)");
            }
            return ["j", node.type, node.key, node.props];
          case "object":
            const clientReference = node.type as null | {
              $$typeof: symbol;
              $$id: string;
              $$name: string;
            };
            if (clientReference?.$$typeof === CLIENT_REFERENCE_SYMBOL) {
              return [
                "c",
                node.key,
                node.props,
                clientReference.$$id,
                clientReference.$$name,
              ];
            }
            throw new Error("Invalid JSXNode");
          default:
            throw new Error("Invalid JSXNode");
        }
      },
    ],
  });
}
