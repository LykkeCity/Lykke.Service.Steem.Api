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
            useAppbaseApi: true
        });
        
    }

    async prepareTransaction(operations: (string | object)[][]): Promise<Transaction> {
        const trx = await steem.broadcast._prepareTransaction({ operations });

        if (this.settings.SteemApi.Steem.ExpireInSeconds > 0) {
            trx.expiration = new Date(Date.now() + this.settings.SteemApi.Steem.ExpireInSeconds * 1000).toISOString().slice(0, -5);
        }

        return trx;
    }

    async accountExists(account: string): Promise<boolean> {
        const accounts = await steem.api.getAccountsAsync([account]);
        return !!accounts && !!accounts.length;
    }

    async config(): Promise<Config> {
        // get server values
        const globals = await steem.api.getConfigAsync();
        const version = await steem.api.callAsync("database_api.get_version", []);
        const config: any = {
            address_prefix: globals["STEEM_ADDRESS_PREFIX"],
            chain_id: version.chain_id
        };

        // configure client library
        for (const k in config) {
            steem.config.set(k, config[k]);
        }

        return config;
    }

    async getLastIrreversibleBlockNumber(): Promise<number> {
        return (await steem.api.getDynamicGlobalPropertiesAsync()).last_irreversible_block_num;
    }

    async getBalance(account: string, assetId: string): Promise<number> {
        const parseAmount = (asset: string) => parseFloat(asset.split(" ")[0]) || 0;
        const accounts = await steem.api.getAccountsAsync([account]);

        if (!!accounts && !!accounts.length) {
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

    async send(tx: SignedTransaction) {
        await steem.api.broadcastTransactionAsync(tx);
    }

    async generateKeys(name: string, password: string) {
        await this.config();
        return steem.auth.getPrivateKeys(name, password, ['owner', 'active', 'posting', 'memo']);
    }

    async accountCreate(creator: string, creatorActivePrivateKey: string, account: string, accountPassword?: string, fee?: string) {
        await this.config();

        const accounts = await steem.api.getAccountsAsync([creator, account]);
        if (accounts.lenght > 1) {
            throw new Error(`Account [${account}] already exists`);
        }

        const password = accountPassword || steem.createSuggestedPassword();
        const keys = steem.auth.getPrivateKeys(account, password, ['owner', 'active', 'posting', 'memo']);
        const result = await steem.broadcast.accountCreateAsync(creatorActivePrivateKey,
            fee || `0.000 ${accounts[0].balance.split(" ")[1]}`,
            creator,
            account,
            { weight_threshold: 1, account_auths: [], key_auths: [[keys.ownerPubkey, 1]] },
            { weight_threshold: 1, account_auths: [], key_auths: [[keys.activePubkey, 1]] },
            { weight_threshold: 1, account_auths: [], key_auths: [[keys.postingPubkey, 1]] },
            keys.memoPubkey,
            "");
        
        return {
            password,
            keys,
            result
        };
    }

    getTransactionId(tx: Transaction): string {
        
        // ID is the first 20 bytes of SHA256 checksum of
        // the serialized transaction (without signatures)

        return steem.ecc.hash.sha256(steem.serializer.ops.transaction.toBuffer(tx)).slice(0, 20).toString("hex");
    }
}