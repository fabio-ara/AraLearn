import { buildStandaloneBridgeSource } from "./aralearnCodexBridge.lib.mjs";

const bridgeSource = buildStandaloneBridgeSource();
const bridgeModuleUrl = `data:text/javascript;base64,${Buffer.from(bridgeSource, "utf8").toString("base64")}`;

await import(bridgeModuleUrl);
