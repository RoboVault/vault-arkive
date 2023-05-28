import { Manifest } from "./deps.ts";
import { Vault } from "./entities/vault.ts";
import { VaultApy } from "./entities/vaultapy.ts";
import { VaultHandler } from "./handlers/vault.ts";

const manifest = new Manifest("vaults");

manifest
	.chain("arbitrum")
	.addBlockHandler({ blockInterval: 1000, startBlockHeight: 86095723n, handler: VaultHandler })

export default manifest
	.addEntities([Vault, VaultApy])
	.build();