import { formatUnits, getContract, stringToBytes, type PublicClient } from "npm:viem";
import {
	type BlockHandler,
	type Store,
} from "https://deno.land/x/robo_arkiver@v0.3.6/mod.ts";
import { SafeBlock } from "https://deno.land/x/robo_arkiver@v0.3.6/src/arkiver/types.ts";
import abi from "../abis/vault.ts"
import { IVault, Vault } from "../entities/vault.ts";
import { VaultApy } from "../entities/vaultapy.ts";

const VAULTS = [
	'0x35eCeC2629CDb1070DF2f9bcaB71E967b88Ac3E0',
	'0x321ed50B1bED49E48D2B04a3667e044d5cF019Da',
] as const

const storeVault = async ({ block, client, store }: {
	block: SafeBlock;
	client: PublicClient;
	store: Store;
}) => {
	let vaultDetails = VAULTS.map(e => {
		return {
			address: e,
			vault: { address: e, abi } as const,
			contract: getContract({ address: e, abi, publicClient: client }),
			name: '',
			symbol: ''
		}
	})

	// const vaults = vaultDetails.map(e => { return { address: e, abi } as const })
	vaultDetails = await Promise.all(vaultDetails.map(async vault => {
		return {
			...vault,
			name: await store.retrieve(`${vault.address}:name`, async () => await vault.contract.read.name()),
			symbol: await store.retrieve(`${vault.address}:symbol`, async () => await vault.contract.read.symbol())
		}
	}));

	const sharePrices = (await client.multicall({
		contracts: vaultDetails.map(vault => { 
			return { ...vault.vault, functionName: 'pricePerShare' }
		})
	})).map(e => parseFloat(formatUnits(e.result || 0n, 6)))

	const vaults = vaultDetails.map((e, i) => {
		return {
			id: `${e.address}-${Number(block.number)}`,
			block: Number(block.number),
			timestamp: Number(block.timestamp),
			vault: e.address,
			sharePrice: sharePrices[i],
			name: e.name,
			symbol: e.symbol,
		}
	})
	
	vaults.forEach(doc => {
		const vault = new Vault(doc)
		vault.save()
	})

	return vaults
}

type Context = {
	block: SafeBlock;
	client: PublicClient;
	store: Store;
}

const storeAPY  = async ({ block, client, store }: Context, vaults: IVault[]) => {
	await Promise.all(vaults.map(async vault => {
		const now = Number(block.timestamp)
		const calcApy = async (vault: IVault, period: number): Promise<number> => {
			const secondsInOneYear = 365 * 24 * 60 * 60
			const from = now - period
			const multiple = secondsInOneYear / period
			const data = await Vault.find({ vault: vault.vault, timestamp: { $lt: from }})
				.limit(1)
				.sort({ timestamp: -1 })
				.select('sharePrice')
				.exec()
			if (!data.length || (data[0].sharePrice == undefined))
				return 0

			const { sharePrice } = data[0]._doc
			return Math.pow((vault.sharePrice / sharePrice), multiple) - 1
		}

		const day = 24 * 60 * 60
		const [ apy1d, apy3d, apy7d, apy14d ] = await Promise.all([
			calcApy(vault, 1 * day),
			calcApy(vault, 3 * day),
			calcApy(vault, 7 * day),
			calcApy(vault, 14 * day),
		])

		const doc = new VaultApy({
			id: `${vault.vault}-${Number(block.number)}`,
			...vault,
			apy1d,
			apy3d,
			apy7d,
			apy14d,
		})
		doc.save()
	}))
}
	

export const VaultHandler: BlockHandler = async (ctx: {
	block: SafeBlock;
	client: PublicClient;
	store: Store;
}): Promise<void> => {
	const vaults = await storeVault(ctx)
	storeAPY(ctx, vaults)
};