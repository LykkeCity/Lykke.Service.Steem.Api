import { Service } from "typedi";
import { Settings } from "../common";

const steem = require("steem");
steem.serializer = require("steem/lib/auth/serializer");
steem.ecc = require("steem/lib/auth/ecc");

export interface Transaction {
    ref_block_num: number;
    ref_block_prefix: number;
    expiration: string; // ISO 8601
    operations: any[];
}

export interface SignedTransaction extends Transaction {
    signatures: any[];
}

export interface Config {
    address_prefix: string;
    chain_id: string;
}

@Service()
export class SteemService {

    constructor(private settings: Settings) {
        steem.api.setOptions({
            url: settings.SteemApi.Steem.Url,
            useAppbaseApi: settings.SteemApi.Steem.UseAppbaseApi
        });
        
    }

    async prepareTransaction(operations: (string | object)[][]): Promise<Transaction> {
        const trx = await steem.broadcast._prepareTransaction({ operations });

        if (this.settings.SteemApi.Steem.ExpireInSeconds > 0) {
            trx.expiration = new Date(Date.now() + this.settings.SteemApi.Steem.ExpireInSeconds * 1000).toISOString().slice(0, -5);
        }

        return trx;
    }

    async getConfig(): Promise<Config> {
        const config = await steem.api.getConfigAsync();
        return {
            address_prefix: config["STEEM_ADDRESS_PREFIX"] || config["STEEMIT_ADDRESS_PREFIX"],
            chain_id: config["STEEM_CHAIN_ID"] || config["STEEMIT_CHAIN_ID"]
        };
    }

    async getLastIrreversibleBlockNumber(): Promise<number> {
        return (await steem.api.getDynamicGlobalPropertiesAsync()).last_irreversible_block_num;
    }

    async getBalance(account: string, assetId: string): Promise<number> {
        const parseAmount = (asset: string) => parseFloat(asset.split(" ")[0]) || 0;
        const accounts = await steem.api.getAccountsAsync([account]);

        if (!!accounts || !!accounts.length) {
            switch (assetId) {
                case "SBD":
                case "TBD":
                    return parseAmount(accounts[0].sbd_balance.toString());
                
                case "STEEM":
                case "TESTS":
                    return parseAmount(accounts[0].balance.toString());

                default:
                    throw new Error(`AssetId [${assetId}] not supported by blockchain`);
            }
        } else {
            throw new Error(`Account [${account}] not found`);
        }
    }

    async send(tx: SignedTransaction): Promise<string> {
        await steem.api.broadcastTransactionAsync(tx);
        return this.getTransactionId(tx);
    }

    async generateKeys(name: string, password: string) {
        const config = await this.getConfig();
        steem.config.set('address_prefix', config.address_prefix);
        steem.config.set('chain_id', config.chain_id);
        return steem.auth.getPrivateKeys(name, password, ['owner', 'active', 'posting', 'memo']);
    }

    getTransactionId(tx: Transaction): string {
        
        // ID is the first 20 bytes of SHA256 checksum of
        // the serialized transaction (without signatures)

        return steem.ecc.hash.sha256(steem.serializer.ops.transaction.toBuffer(tx)).slice(0, 20).toString("hex");
    }
}