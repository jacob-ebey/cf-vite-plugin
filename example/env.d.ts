declare module "__STATIC_CONTENT_MANIFEST" {
  const manifest: string;
  export default manifest;
}

declare module "asset:*" {
  const url: string;
  export default url;
}
