declare module "virtual:client-modules" {
  const clientModules: Record<string, () => Promise<Record<string, unknown>>>;

  export default clientModules;
}

declare module "virtual:server-modules" {
  const serverModules: Record<string, () => Promise<Record<string, unknown>>>;

  export default serverModules;
}
