import { createEntity } from "../deps.ts";

export interface IVaultApy {
	vault: string
	name: string
	symbol: string
	block: number
	timestamp: number
	apy1d: number
	apy3d: number
	apy7d: number
	apy14d: number
}

export const VaultApy = createEntity<IVaultApy>("VaultApy", {
	vault: String,
	name: String,
	symbol: String,
	block: { type: Number, index: true },
	timestamp: { type: Number, index: true },
	apy1d: Number,
	apy3d: Number,
	apy7d: Number,
	apy14d: Number,
});
