import { MongoEntity, MongoRepository, MongoQueryResult } from "./mongo";
import { Settings } from "../common";
import { isString } from "util";
import { Service } from "typedi";


export class BalanceEntity extends MongoEntity<{ Address: string, AssetId: string }> {
    Amount: number;
    AmountInBaseUnit: number;
    Block: number;
}

@Service()
export class BalanceRepository extends MongoRepository {

    private addressCollectionName: string = "SteemBalanceAddresses";
    private balanceCollectionName: string = "SteemBalances";

    constructor(settings: Settings) {
        super(
            settings.SteemApi.Mongo.ConnectionString,
            settings.SteemApi.Mongo.User,
            settings.SteemApi.Mongo.Password,
            settings.SteemApi.Mongo.Database);
    }

    async observe(address: string) {
        const db = await this.db();
        await db.collection(this.addressCollectionName)
            .replaceOne(
                { _id: address },
                { _id: address },
                { upsert: true }
            );

        await db.collection(this.balanceCollectionName)
            .updateMany(
                { Address: { $eq: address } },
                { $set: { IsObservable: true } }
            );
    }

    async isObservable(address: string): Promise<boolean> {
        const db = await this.db();
        const entity = await db.collection(this.addressCollectionName).findOne({ _id: address });

        return !!entity;
    }

    async remove(address: string) {
        const db = await this.db();
        await db.collection(this.addressCollectionName).deleteOne({ _id: address });
        await db.collection(this.balanceCollectionName)
            .updateMany(
                { Address: { $eq: address } },
                { $set: { IsObservable: false } }
            );
    }

    async upsert(address: string, assetId: string, operationOrTxId: string, amount: number, amountInBaseUnit: number, block: number) {
        const db = await this.db();
        const id = `${address}_${assetId}_${operationOrTxId}`;
        const isObservable = await this.isObservable(address);
        await db.collection(this.balanceCollectionName)
            .updateOne(
                { _id: id },
                { $set: { _id: id, Address: address, AssetId: assetId, OperationOrTxId: operationOrTxId, Amount: amount, AmountInBaseUnit: amountInBaseUnit, Block: block, IsObservable: isObservable } },
                { upsert: true }
            );
    }

    async update(address: string, assetId: string, operationOrTxId: string, params: { isCancelled: boolean }) {
        const db = await this.db();
        const id = `${address}_${assetId}_${operationOrTxId}`;
        await db.collection(this.balanceCollectionName)
            .updateOne(
                { _id: id },
                { $set: { IsCancelled: params.isCancelled } },
                { upsert: true }
            );
    }

    async get(address: string, assetId: string): Promise<BalanceEntity>;
    async get(take: number, continuation?: string): Promise<MongoQueryResult<BalanceEntity>>;
    async get(addressOrTake: string | number, assetIdOrcontinuation?: string): Promise<BalanceEntity | MongoQueryResult<BalanceEntity>> {
        const db = await this.db();
        if (isString(addressOrTake)) {
            return await db.collection<BalanceEntity>(this.balanceCollectionName)
                .aggregate([
                    { $match: { Address: addressOrTake, AssetId: assetIdOrcontinuation, IsCancelled: { $ne: true } } },
                    { $group: { _id: { Address: "$Address", AssetId: "$AssetId" }, Amount: { $sum: "$Amount" }, AmountInBaseUnit: { $sum: "$AmountInBaseUnit" }, Block: { $max: "$Block" } } },
                ])
                .next();
        } else {
            const skip = parseInt(assetIdOrcontinuation) || 0;
            const entities = await db.collection<BalanceEntity>(this.balanceCollectionName)
                .aggregate([
                    { $match: { IsCancelled: { $ne: true }, IsObservable: { $eq: true } } },
                    { $group: { _id: { Address: "$Address", AssetId: "$AssetId" }, Amount: { $sum: "$Amount" }, AmountInBaseUnit: { $sum: "$AmountInBaseUnit" }, Block: { $max: "$Block" } } },
                    // { $match: { Amount: { $gt: 0 } } }, // CosmosDB doesn't suppport multiple $match-es in public preview version
                    { $skip: skip },
                    { $limit: addressOrTake }
                ])
                .toArray();

            return new MongoQueryResult(entities, entities.length < addressOrTake ? null : (skip + addressOrTake).toFixed());
        }
    }

    validateContinuation(continuation: string): boolean {
        return !continuation || (!Number.isNaN(parseInt(continuation)) && /^\d+$/.test(continuation));
    }
}