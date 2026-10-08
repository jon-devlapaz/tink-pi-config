import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

export function commandApi(pi: ExtensionAPI): ExtensionAPI {
  return new Proxy(pi, {
    get(target, key, receiver) {
      if (key === "registerCommand")
        return (
          name: string,
          command: Parameters<ExtensionAPI["registerCommand"]>[1],
        ) => {
          target.registerCommand(
            name === "subagents" ? "herdr-config" : name,
            command,
          );
        };
      return Reflect.get(target, key, receiver);
    },
  });
}

export default async function herdrCommands(pi: ExtensionAPI) {
  const vendor = pathToFileURL(
    join(getAgentDir(), "npm/node_modules/@andrewjacop/pi-herdr/src/index.ts"),
  ).href;
  const { default: register } = (await import(vendor)) as {
    default: ExtensionFactory;
  };
  await register(commandApi(pi));
}
