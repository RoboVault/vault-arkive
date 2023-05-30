import { formatUnits, getContract, type PublicClient, type Block } from "npm:viem";
import {
	type BlockHandler,
	type Store,
} from "https://deno.land/x/robo_arkiver@v0.3.6/mod.ts";
import { SafeBlock } from "https://deno.land/x/robo_arkiver@v0.3.6/src/arkiver/types.ts";
import abi from "../abis/vault.ts"
import { IVault, Vault } from "../entities/vault.ts";
import { VaultApy } from "../entities/vaultapy.ts";
import { Snapshot } from "../entities/snaphot.ts";

type VaultSnapshot = {
    id: string;
    block: number;
    timestamp: number;
    vault: string;
    sharePrice: number;
    name: string;
    symbol: string;
	apy1d: number
	apy3d: number
	apy7d: number
	apy14d: number
}

const VAULTS = [
	{ addr: '0x35eCeC2629CDb1070DF2f9bcaB71E967b88Ac3E0', block: 32887180 },
	{ addr: '0x321ed50B1bED49E48D2B04a3667e044d5cF019Da', block: 32887180 },
] as const

const HOUR = 60 * 60
const nearestHour = (now: number) => {
	return Math.floor(now / HOUR) * HOUR
}

const DAY = 60 * 60 * 24
const nearestDay = (now: number) => {
	return Math.floor(now / DAY) * DAY
}

const storeVault = async ({ block, client, store }: {
	block: SafeBlock;
	client: PublicClient;
	store: Store;
}) => {
	const liveVaults = VAULTS.filter(e => e.block < Number(block.number))
	let vaultDetails = liveVaults.map(e => {
		return {
			address: e.addr,
			vault: { address: e.addr, abi } as const,
			contract: getContract({ address: e.addr, abi, publicClient: client }),
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
	const sharePrices = (await Promise.all(vaultDetails.map(e => {
		return client.readContract({
			address: e.address,
			abi,
			functionName: 'pricePerShare',
			blockNumber: block.number,
		})
	}))).map(e => parseFloat(formatUnits(e || 0n, 6)))

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

const storeAPY  = async ({ block, client, store }: Context, vaults: IVault[]): Promise<VaultSnapshot[]> => {
	return await Promise.all(vaults.map(async vault => {
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

		const vaultDoc = {
			id: `${vault.vault}-${Number(block.number)}`,
			...vault,
			apy1d,
			apy3d,
			apy7d,
			apy14d,
		}
		const doc = new VaultApy(vaultDoc)
		doc.save()
		return vaultDoc
	}))
}

const hourSnapshot = async (now: number, vaults: VaultSnapshot[]): Promise<void> => {
	const nowHour = nearestHour(now)
	const last = await Snapshot.findOne({ res: '1h' }).sort({ timestamp: -1 })
	const lastHour = last?.timestamp ?? (nowHour - HOUR)

	if (lastHour < nowHour) {
		Snapshot.bulkSave(vaults.map(vault => new Snapshot({ ...vault, res: '1h', timestamp: nowHour})))
	}
}

const daySnapshot = async (now: number, vaults: VaultSnapshot[]): Promise<void> => {
	const nowDay = nearestDay(now)
	const last = await Snapshot.findOne({ res: '1d' }).sort({ timestamp: -1 })
	const lastHour = last?.timestamp ?? (nowDay - HOUR)

	if (lastHour < nowDay) {
		Snapshot.bulkSave(vaults.map(vault => new Snapshot({ ...vault, res: '1d', timestamp: nowDay})))
	}
}
	
export const VaultHandler: BlockHandler = async (ctx: {
	block: SafeBlock;
	client: PublicClient;
	store: Store;
}): Promise<void> => {
	const vaults = await storeVault(ctx)
	const snapshots = await storeAPY(ctx, vaults)
	hourSnapshot(Number(ctx.block.timestamp), snapshots)
	daySnapshot(Number(ctx.block.timestamp), snapshots)
};