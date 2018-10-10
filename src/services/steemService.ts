import { Service } from "typedi";
import { Settings } from "../common";
import retry from "async-retry";

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
    [key: string]: any;
}

@Service()
export class SteemService {

    private _config: Config;

    private async retry<T>(func: () => Promise<T>): Promise<T> {
        return await retry(async (bail) => {
            try {
                return await func();
            } catch (err) {
                if ((err.message == "Unable to acquire database lock") ||                       // common steemd error
                    (err.message == "Unknown exception") ||                                     // rare steemd error
                    (err.message == "Internal Error" || err.code == -32603) ||                  // generic jussi error
                    (err.message == "Bad or missing upstream response" && err.code == 1100)) {  // jussi timeout error
                    throw err; // retry
                } else {
                    bail(err); // break
                }
            }
        }, { factor: 1 });
    }

    constructor(private settings: Settings) {
        steem.api.setOptions({
            url: settings.SteemApi.Steem.Url,
            useAppbaseApi: true
        });
        
    }

    async prepareTransaction(operations: (string | object)[][]): Promise<Transaction> {
        const trx = await this.retry<any>(() => steem.broadcast._prepareTransaction({ operations }));

        if (this.settings.SteemApi.Steem.ExpireInSeconds > 0) {
            trx.expiration = new Date(Date.now() + this.settings.SteemApi.Steem.ExpireInSeconds * 1000).toISOString().slice(0, -5);
        }

        return trx;
    }

    async accountExists(account: string): Promise<boolean> {
        return !!(await this.getAccounts(account)).length;
    }

    async config(): Promise<Config> {
        if (!this._config) {
            // get server values
            const globals = await this.retry<any>(() => steem.api.getConfigAsync());
            const version = await this.retry<any>(() => steem.api.callAsync("database_api.get_version", {}));
            this._config = {
                address_prefix: globals["STEEM_ADDRESS_PREFIX"],
                chain_id: version.chain_id
            };

            // configure client library
            for (const key in this._config) {
                steem.config.set(key, this._config[key]);
            }
        }

        return this._config;
    }

    async getAccounts(...names: string[]): Promise<any[]> {
        return await this.retry<any[]>(() => steem.api.getAccountsAsync(names));
    }

    async getLastIrreversibleBlockNumber(): Promise<number> {
        return (await this.retry<any>(() => steem.api.getDynamicGlobalPropertiesAsync())).last_irreversible_block_num;
    }

    async getBalance(account: string, assetId: string): Promise<number> {
        const parseAmount = (asset: string) => parseFloat(asset.split(" ")[0]) || 0;
        const accounts = await this.getAccounts(account);

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

    async accountCreate(creator: string, creatorActivePrivateKey: string, account: string, accountPassword?: string, fee?: string, ) {
        await this.config();

        const accounts = await this.getAccounts(creator, account);
        if (accounts.length > 1) {
            throw new Error(`Account [${account}] already exists`);
        }

        const symbol = accounts[0].balance.split(" ")[1];
        const password = accountPassword || steem.formatter.createSuggestedPassword();
        const keys = steem.auth.getPrivateKeys(account, password, ['owner', 'active', 'posting', 'memo']);
        const result = await steem.broadcast.accountCreateAsync(
            creatorActivePrivateKey,
            fee || `0.000 ${symbol}`,
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

    async delegateVestingShares(delegator: string, delegatorActivePrivateKey: string, delegatee: string, vestingShares: number) {
        await this.config();
        return await steem.broadcast.delegateVestingSharesAsync(delegatorActivePrivateKey, delegator, delegatee, `${vestingShares.toFixed(6)} VESTS`);
    }

    async transferToVesting(from: string, fromActivePrivateKey: string, to: string, amount: number) {
        await this.config();
        const accounts = await this.getAccounts(from, to);
        if (accounts.length != 2) {
            throw new Error(`Wrong accounts`);
        }
        const symbol = accounts[0].balance.split(" ")[1];
        return await steem.broadcast.transferToVestingAsync(fromActivePrivateKey, from, to, `${amount.toFixed(3)} ${symbol}`);
    }

    getTransactionId(tx: Transaction): string {
        
        // ID is the first 20 bytes of SHA256 checksum of
        // the serialized transaction (without signatures)

        return steem.ecc.hash.sha256(steem.serializer.ops.transaction.toBuffer(tx)).slice(0, 20).toString("hex");
    }
}