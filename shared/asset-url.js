// The production assembler replaces this with a hash of the published files.
export const ASSET_VERSION = "__SITE_ASSET_VERSION__";

export function versionedAsset(path, base = "") {
  const url = `${base}${path.replace(/^\/+/, "")}`;
  return `${url}${url.includes("?") ? "&" : "?"}v=${ASSET_VERSION}`;
}
