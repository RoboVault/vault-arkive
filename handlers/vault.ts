import { Block, formatUnits, getContract, type PublicClient } from 'npm:viem'
import {
	type BlockHandler,
	type Store,
} from 'https://deno.land/x/robo_arkiver@v0.4.21/mod.ts'
import abi from '../abis/vault.ts'
import { IVault, Vault } from '../entities/vault.ts'
import { VaultApy } from '../entities/vaultapy.ts'

const VAULTS = [
	{ addr: '0x2a958665bC9A1680135241133569C7014230Cb21', block: 86095723 },
] as const

const storeVault = async ({ block, client, store }: {
	block: Block
	client: PublicClient
	store: Store
}) => {
	const liveVaults = VAULTS.filter((e) => e.block < Number(block.number))
	let vaultDetails = liveVaults.map((e) => {
		return {
			address: e.addr,
			vault: { address: e.addr, abi } as const,
			contract: getContract({ address: e.addr, abi, publicClient: client }),
			name: '',
			symbol: '',
		}
	})

	vaultDetails = await Promise.all(vaultDetails.map(async (vault) => {
		return {
			...vault,
			name: await store.retrieve(
				`${vault.address}:name`,
				async () => await vault.contract.read.name(),
			),
			symbol: await store.retrieve(
				`${vault.address}:symbol`,
				async () => await vault.contract.read.symbol(),
			),
		}
	}))

	const [sharePrices, totalSupplies] = (await Promise.all([
		client.multicall({
			contracts: vaultDetails.map((e) => {
				return {
					address: e.address,
					abi,
					functionName: 'pricePerShare',
				}
			}),
			blockNumber: block.number!,
		}),
		client.multicall({
			contracts: vaultDetails.map((e) => {
				return {
					address: e.address,
					abi,
					functionName: 'totalSupply',
				}
			}),
			blockNumber: block.number!,
		}),
	])).map((func) => func.map((e) => formatUnits(e.result!, 6)))

	const vaults = vaultDetails.map((e, i) => {
		return {
			block: Number(block.number),
			timestamp: Number(block.timestamp),
			vault: e.address,
			sharePrice: sharePrices[i],
			totalSupply: totalSupplies[i],
			name: e.name,
			symbol: e.symbol,
		}
	})

	vaults.forEach((doc) => {
		console.log(doc)
		const vault = new Vault(doc)
		vault.save()
	})

	return vaults as any
}

type Context = {
	block: Block
	client: PublicClient
	store: Store
}

const storeAPY = async (
	{ block, client, store }: Context,
	vaults: IVault[],
) => {
	await Promise.all(vaults.map(async (vault) => {
		const now = Number(block.timestamp)
		const calcApy = async (vault: IVault, period: number): Promise<number> => {
			const secondsInOneYear = 365 * 24 * 60 * 60
			const from = now - period
			const multiple = secondsInOneYear / period
			const data = await Vault.find({
				vault: vault.vault,
				timestamp: { $lt: from },
			})
				.limit(1)
				.sort({ timestamp: -1 })
				.select('sharePrice')
				.exec()
			if (!data.length || (data[0].sharePrice == undefined)) {
				return 0
			}

			const { sharePrice } = data[0]
			return Math.pow(vault.sharePrice / sharePrice, multiple) - 1
		}

		const day = 24 * 60 * 60
		const [apy1d, apy3d, apy7d, apy14d] = await Promise.all([
			calcApy(vault, 1 * day),
			calcApy(vault, 3 * day),
			calcApy(vault, 7 * day),
			calcApy(vault, 14 * day),
		])

		const doc = new VaultApy({
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
	block: Block
	client: PublicClient
	store: Store
}): Promise<void> => {
	console.log('running vault handler at block ', ctx.block.number)
	const vaults = await storeVault(ctx)
	storeAPY(ctx, vaults)
}
