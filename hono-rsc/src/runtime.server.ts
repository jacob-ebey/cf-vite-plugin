export function registerClientReference(proxy: any, id: string, name: string) {
  return Object.defineProperties(proxy, {
    $$typeof: { value: Symbol.for("hono.client.reference") },
    $$id: { value: id },
    $$name: { value: name },
  });
}

export function registerServerReference(...args: any[]) {
  throw new Error("Server references not implemented yet");
}
