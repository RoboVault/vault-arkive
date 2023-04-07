import { Manifest } from "./deps.ts";
import { Vault } from "./entities/vault.ts";
import { VaultApy } from "./entities/vaultapy.ts";
import { VaultHandler } from "./handlers/vault.ts";

const manifest = new Manifest("yiedlfi-vaults");

manifest
	.chain("mumbai")
	.addBlockHandler({ blockInterval: 30, startBlockHeight: 32887180n, handler: VaultHandler })

export default manifest
	.addEntities([Vault, VaultApy])
	.build();