import { JsonController, Post, Body, HttpError } from "routing-controllers";
import { IsSteemAddress } from "../common";
import { SteemService } from "../services/steemService";
import { IsString, IsOptional, IsNotEmpty, IsNumber } from "class-validator";

class CreateRequest {
    @IsNotEmpty()
    @IsString()
    @IsSteemAddress()
    creator: string;

    @IsNotEmpty()
    @IsString()
    creatorActivePrivateKey: string;

    @IsNotEmpty()
    @IsString()
    @IsSteemAddress()
    newAccountName: string;

    @IsOptional()
    @IsString()
    newAccountPassword: string;

    @IsOptional()
    metadata: object;
}

class DelegateVestingSharesRequest {
    @IsNotEmpty()
    @IsString()
    @IsSteemAddress()
    delegator: string;

    @IsNotEmpty()
    @IsString()
    delegatorActivePrivateKey: string;

    @IsNotEmpty()
    @IsString()
    @IsSteemAddress()
    delegatee: string;

    @IsNotEmpty()
    @IsNumber()
    amountInVests: number;
}

class TransferToVestingRequest {
    @IsNotEmpty()
    @IsString()
    @IsSteemAddress()
    from: string;

    @IsNotEmpty()
    @IsString()
    fromActivePrivateKey: string;

    @IsNotEmpty()
    @IsString()
    @IsSteemAddress()
    to: string;

    @IsNotEmpty()
    @IsNumber()
    amountInSteem: number;
}

class WithdrawVestingRequest {
    @IsNotEmpty()
    @IsString()
    @IsSteemAddress()
    account: string;

    @IsNotEmpty()
    @IsString()
    accountActivePrivateKey: string;

    @IsNotEmpty()
    @IsNumber()
    amountInVests: number;
}

class GenerateKeysRequest {
    @IsNotEmpty()
    @IsString()
    @IsSteemAddress()
    account: string;

    @IsNotEmpty()
    @IsString()
    accountPassword: string;
}

@JsonController("/accounts")
export class AddressesController {

    constructor(private steemService: SteemService) {
    }

    @Post("/create")
    async create(@Body() request: CreateRequest) {
        if (await this.steemService.accountExists(request.newAccountName)) {
            throw new HttpError(409, `Account ${request.newAccountName} already exists`);
        }

        return await this.steemService.accountCreate(
            request.creator,
            request.creatorActivePrivateKey,
            request.newAccountName,
            request.newAccountPassword,
            request.metadata);
    }

    @Post("/generateKeys")
    async generateKeys(@Body() request: GenerateKeysRequest) {
        return await this.steemService.generateKeys(request.account, request.accountPassword);
    }

    @Post("/delegateVestingShares")
    async delegateVestingShares(@Body() request: DelegateVestingSharesRequest) {
        return await this.steemService.delegateVestingShares(
            request.delegator,
            request.delegatorActivePrivateKey,
            request.delegatee,
            request.amountInVests);
    }

    @Post("/transferToVesting")
    async transferToVesting(@Body() request: TransferToVestingRequest) {
        return await this.steemService.transferToVesting(
            request.from,
            request.fromActivePrivateKey,
            request.to,
            request.amountInSteem);
    }

    @Post("/withdrawVesting")
    async withdrawVesting(@Body() request: WithdrawVestingRequest) {
        return await this.steemService.withdrawVesting(
            request.account,
            request.accountActivePrivateKey,
            request.amountInVests);
    }
}