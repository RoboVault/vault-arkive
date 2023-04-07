import { createEntity } from "../deps.ts";

export interface IVault {
	// Tags
	vault: string
	name: string
	symbol: string
	// Fields
	block: number
	timestamp: number
	sharePrice: number
	// totalAssets: number
}

export const Vault = createEntity<IVault>("Vault", {
	vault: String,
	name: String,
	symbol: String,
	block: { type: Number, index: true },
	timestamp: { type: Number, index: true },
	sharePrice: { type: Number, index: true },
	// totalAssets: { type: Number, index: true },
});
