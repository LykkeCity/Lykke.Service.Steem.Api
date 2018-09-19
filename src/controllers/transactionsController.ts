import { JsonController, Body, Get, Post, Put, Delete, OnUndefined, QueryParam } from "routing-controllers";
import { IsArray, IsString, IsNotEmpty, IsBase64, IsUUID } from "class-validator";
import { SteemService, SignedTransaction } from "../services/steemService";
import { AssetRepository } from "../domain/assets";
import { OperationRepository, OperationType, OperationEntity, ErrorCode } from "../domain/operations";
import { toBase64, fromBase64, ADDRESS_SEPARATOR, isoUTC, ParamIsUuid, QueryParamIsPositiveInteger, IsSteemAddress, ParamIsSteemAddress } from "../common";
import { NotImplementedError } from "../errors/notImplementedError";
import { LogService, LogLevel } from "../services/logService";
import { BlockchainError } from "../errors/blockchainError";
import { HistoryRepository, HistoryAddressCategory } from "../domain/history";
import { BalanceRepository } from "../domain/balances";

require("steem")

class BuildSingleRequest {
    @IsString()
    @IsNotEmpty()
    @IsUUID()
    operationId: string;

    @IsString()
    @IsNotEmpty()
    @IsSteemAddress()
    fromAddress: string;

    fromAddressContext?: string;

    @IsString()
    @IsNotEmpty()
    @IsSteemAddress()
    toAddress: string;

    @IsString()
    @IsNotEmpty()
    assetId: string;

    @IsString()
    @IsNotEmpty()
    amount: string;

    includeFee?: boolean;
}

class Input {
    @IsString()
    @IsNotEmpty()
    @IsSteemAddress()
    fromAddress: string;

    fromAddressContext?: string;

    @IsString()
    @IsNotEmpty()
    amount: string;
}

class BuildManyInputsRequest {
    @IsString()
    @IsNotEmpty()
    @IsUUID()
    operationId: string;

    @IsArray()
    @IsNotEmpty()
    inputs: Input[];

    @IsString()
    @IsNotEmpty()
    @IsSteemAddress()
    toAddress: string;

    @IsString()
    @IsNotEmpty()
    assetId: string;
}

class Output {
    @IsString()
    @IsNotEmpty()
    @IsSteemAddress()
    toAddress: string;

    @IsString()
    @IsNotEmpty()
    amount: string;
}

class BuildManyOutputsRequest {
    @IsString()
    @IsNotEmpty()
    @IsUUID()
    operationId: string;

    @IsString()
    @IsNotEmpty()
    @IsSteemAddress()
    fromAddress: string;

    fromAddressContext?: string;

    @IsArray()
    @IsNotEmpty()
    outputs: Output[];

    @IsString()
    @IsNotEmpty()
    assetId: string;
}

class BroadcastRequest {
    @IsString()
    @IsNotEmpty()
    @IsUUID()
    operationId: string;

    @IsString()
    @IsNotEmpty()
    @IsBase64()
    signedTransaction: string;
}

enum State {
    inProgress = "inProgress",
    completed = "completed",
    failed = "failed"
}

interface SignedTransactionModel extends SignedTransaction {
    txId: string;
}

class KeysParameters {
    username: string;
    password: string;
}

@JsonController("/transactions")
export class TransactionsController {

    constructor(
        private logService: LogService,
        private steemService: SteemService,
        private operationRepository: OperationRepository,
        private assetRepository: AssetRepository,
        private historyRepository: HistoryRepository,
        private balanceRepository: BalanceRepository) {
    }

    private getAccount(address: string) {
        return address.split(ADDRESS_SEPARATOR)[0];
    }

    private isSimulated(from: string, to: string): boolean {
        return this.getAccount(from) == this.getAccount(to);
    }

    private getState(operation: OperationEntity): State {
        return !!operation.FailTime ? State.failed : !!operation.CompletionTime ? State.completed : State.inProgress;
    }

    private getTimestamp(operation: OperationEntity): Date {
        return operation.FailTime || operation.CompletionTime || operation.SendTime;
    }

    private async build(type: OperationType, operationId: string, assetId: string, inOut: { fromAddress: string, toAddress: string, amount: string }[]) {
        const operation = await this.operationRepository.get(operationId);
        if (!!operation && operation.isSent()) {
            throw new BlockchainError({ status: 409, message: `Operation [${operationId}] already broadcasted` });
        }

        const asset = await this.assetRepository.get(assetId);
        if (asset == null) {
            throw new BlockchainError({ status: 400, message: `Unknown asset [${assetId}]` });
        }

        const opActions = [];
        const txActions = [];

        for (const action of inOut) {
            const amountInBaseUnit = parseInt(action.amount);

            if (Number.isNaN(amountInBaseUnit) || amountInBaseUnit <= 0) {
                throw new BlockchainError({ status: 400, message: `Invalid amount [${action.amount}]` });
            }

            const amount = asset.fromBaseUnit(amountInBaseUnit);

            opActions.push({
                ...action,
                amountInBaseUnit,
                amount
            });

            let balanceInBaseUnit = 0;

            if (this.isSimulated(action.fromAddress, action.toAddress)) {
                const balanceEntity = await this.balanceRepository.get(action.fromAddress, assetId);
                balanceInBaseUnit = balanceEntity && balanceEntity.AmountInBaseUnit;
            } else {
                const from = this.getAccount(action.fromAddress);
                const to = this.getAccount(action.toAddress);
                const assetAmount = `${amount.toFixed(asset.Accuracy)} ${asset.AssetId}`;
                const memo = action.toAddress.split(ADDRESS_SEPARATOR)[1];
                balanceInBaseUnit = asset.toBaseUnit(
                    await this.steemService.getBalance(from, asset.AssetId)
                );
                txActions.push([
                    "transfer",
                    { from, to, amount: assetAmount, memo }
                ]);
            }

            if (balanceInBaseUnit < amountInBaseUnit) {
                throw new BlockchainError({ status: 400, message: `Not enough balance on address [${action.fromAddress}]`, errorCode: ErrorCode.notEnoughBalance });
            }
        }

        const context = {
            config: await this.steemService.getConfig(),
            tx: !!txActions.length && await this.steemService.prepareTransaction(txActions)
        };

        await this.operationRepository.upsert(operationId, type, assetId, opActions, context.tx && isoUTC(context.tx.expiration));

        return {
            transactionContext: toBase64(context)
        };
    }

    private async getHistory(category: HistoryAddressCategory, address: string, take: number, afterHash: string) {
        const history = await this.historyRepository.get(category, address, take, afterHash);

        return history.map(e => ({
            timestamp: e.BlockTime,
            fromAddress: e.From,
            toAsdress: e.To,
            assetId: e.AssetId,
            amount: e.AmountInBaseUnit.toFixed(),
            hash: e.TxId
        }));
    }

    @Post("/single")
    async buildSingle(@Body({ required: true }) request: BuildSingleRequest) {
        return await this.build(OperationType.Single, request.operationId, request.assetId, Array.of(request))
    }

    @Post("/many-inputs")
    async buildManyInputs(@Body({ required: true }) request: BuildManyInputsRequest) {
        return await this.build(OperationType.ManyInputs,
            request.operationId,
            request.assetId,
            request.inputs.map(vin => ({
                toAddress: request.toAddress,
                ...vin
            })));
    }

    @Post("/many-outputs")
    async buildManyOutputs(@Body({ required: true }) request: BuildManyOutputsRequest) {
        return await this.build(OperationType.ManyOutputs,
            request.operationId,
            request.assetId,
            request.outputs.map(vout => ({
                fromAddress: request.fromAddress,
                ...vout
            })));
    }

    @Put()
    async Rebuild() {
        throw new NotImplementedError();
    }

    @Post("/broadcast")
    async broadcast(@Body({ required: true }) request: BroadcastRequest) {

        const operation = await this.operationRepository.get(request.operationId);
        if (!operation) {
            // transaction must be built before
            throw new BlockchainError({ status: 400, message: `Unknown operation [${request.operationId}]` });
        } else if (!!operation.SendTime) {
            // sendTime is not null only if all related data already successfully saved
            throw new BlockchainError({ status: 409, message: `Operation [${request.operationId}] already broadcasted` });
        }

        const sendTime = new Date();
        const block = operation.Block || ((await this.steemService.getLastIrreversibleBlockNumber()) * 10 + 1);
        const blockTime = operation.BlockTime || sendTime;
        const completionTime = operation.CompletionTime || sendTime;
        const tx = fromBase64<SignedTransactionModel>(request.signedTransaction);
        let txId = tx.txId;

        if (!!txId) {

            // for fully simulated transaction we immediately update
            // balances and history, and mark operation as completed

            const operationActions = await this.operationRepository.getActions(operation.OperationId);

            for (const action of operationActions) {
                // record balance changes
                const balanceChanges = [
                    { address: action.FromAddress, affix: -action.Amount, affixInBaseUnit: -action.AmountInBaseUnit },
                    { address: action.ToAddress, affix: action.Amount, affixInBaseUnit: action.AmountInBaseUnit }
                ];
                for (const bc of balanceChanges) {
                    await this.balanceRepository.upsert(bc.address, operation.AssetId, operation.OperationId, bc.affix, bc.affixInBaseUnit, block);
                    await this.logService.write(LogLevel.info, TransactionsController.name, this.broadcast.name,
                        "Balance change recorded", JSON.stringify({ ...bc, assetId: operation.AssetId, txId }));
                }

                // upsert history of simulated operation action
                await this.historyRepository.upsert(action.FromAddress, action.ToAddress, operation.AssetId, action.Amount, action.AmountInBaseUnit,
                    block, blockTime, txId, action.RowKey, operation.OperationId);
            }

            // save send time and transaction id and mark operation as completed
            await this.operationRepository.update(operation.OperationId, { sendTime, txId, completionTime, blockTime, block });

        } else {

            // send [partially] real transaction to the blockchain,
            // balances will be handled by job, when transaction will be
            // included in block and when it becomes irreversible

            try {
                txId = await this.steemService.send(tx);
            } catch (error) {
                if (!!error.data && error.data.code == 4030100) {
                    throw new BlockchainError({ status: 400, message: "Transaction rejected", errorCode: ErrorCode.buildingShouldBeRepeated, data: error.data });
                } else {
                    throw error;
                }
            }

            // save send time and transaction id
            await this.operationRepository.update(operation.OperationId, { sendTime, txId });
        }

        return { txId };
    }

    @Get("/broadcast/single/:operationId")
    async getSingle(@ParamIsUuid("operationId") operationId: string) {
        const operation = await this.operationRepository.get(operationId);
        if (!!operation && operation.isSent()) {
            return {
                operationId,
                state: this.getState(operation),
                timestamp: this.getTimestamp(operation),
                amount: operation.AmountInBaseUnit.toFixed(),
                fee: "0",
                hash: operation.TxId,
                block: operation.Block,
                error: operation.Error,
                errorCode: operation.ErrorCode
            };
        } else {
            return null;
        }
    }

    @Get("/broadcast/many-inputs/:operationId")
    async getManyInputs(@ParamIsUuid("operationId") operationId: string) {
        const operation = await this.operationRepository.get(operationId);
        if (!!operation && operation.isSent()) {
            const actions = await this.operationRepository.getActions(operationId);
            return {
                operationId,
                state: this.getState(operation),
                timestamp: this.getTimestamp(operation),
                inputs: actions.map(a => ({
                    amount: a.AmountInBaseUnit.toFixed(),
                    fromAddress: a.FromAddress
                })),
                fee: "0",
                hash: operation.TxId,
                block: operation.Block,
                error: operation.Error,
                errorCode: operation.ErrorCode
            };
        } else {
            return null;
        }
    }

    @Get("/broadcast/many-outputs/:operationId")
    async getManyOutputs(@ParamIsUuid("operationId") operationId: string) {
        const operation = await this.operationRepository.get(operationId);
        if (!!operation && operation.isSent()) {
            const actions = await this.operationRepository.getActions(operationId);
            return {
                operationId,
                state: this.getState(operation),
                timestamp: this.getTimestamp(operation),
                outputs: actions.map(a => ({
                    amount: a.AmountInBaseUnit.toFixed(),
                    toAddress: a.ToAddress
                })),
                fee: "0",
                hash: operation.TxId,
                block: operation.Block,
                error: operation.Error,
                errorCode: operation.ErrorCode
            };
        } else {
            return null;
        }
    }

    @Delete("/broadcast/:operationId")
    @OnUndefined(200)
    async deleteBroadcasted(@ParamIsUuid("operationId") operationId: string) {
        await this.operationRepository.update(operationId, {
            deleteTime: new Date()
        });
    }

    @Get("/history/from/:address")
    async getHistoryFrom(
        @ParamIsSteemAddress("address") address: string,
        @QueryParamIsPositiveInteger("take") take: number,
        @QueryParam("afterHash") afterHash: string) {

        return await this.getHistory(HistoryAddressCategory.From, address, take, afterHash);
    }

    @Get("/history/to/:address")
    async getHistoryTo(
        @ParamIsSteemAddress("address") address: string,
        @QueryParamIsPositiveInteger("take") take: number,
        @QueryParam("afterHash") afterHash: string) {

        return await this.getHistory(HistoryAddressCategory.To, address, take, afterHash);
    }

    @Post("/history/from/:address/observation")
    @OnUndefined(200)
    async observeFrom(@ParamIsSteemAddress("address") address: string) {
        // always OK due to controlling transaction tracking by node's configuration
    }

    @Delete("/history/from/:address/observation")
    @OnUndefined(200)
    async deleteFromObservation(@ParamIsSteemAddress("address") address: string) {
        // always OK due to controlling transaction tracking by node's configuration
    }

    @Post("/history/to/:address/observation")
    @OnUndefined(200)
    async observeTo(@ParamIsSteemAddress("address") address: string) {
        // always OK due to controlling transaction tracking by node's configuration
    }

    @Delete("/history/to/:address/observation")
    @OnUndefined(200)
    async deleteToObservation(@ParamIsSteemAddress("address") address: string) {
        // always OK due to controlling transaction tracking by node's configuration
    }

    @Post("/generateKeys")
    async keys(@Body() params: KeysParameters) {
        return await this.steemService.generateKeys(params.username, params.password);
    }
}