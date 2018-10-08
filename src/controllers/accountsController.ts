import { JsonController, Post, Body } from "routing-controllers";
import { IsSteemAddress } from "../common";
import { SteemService } from "../services/steemService";
import { IsString, IsOptional, IsNotEmpty, IsNumber } from "class-validator";
import { BlockchainError } from "../errors/blockchainError";

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
    account: string;

    @IsOptional()
    @IsString()
    accountPassword: string;

    @IsOptional()
    @IsString()
    fee: string;
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
    vestingShares: number;
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
    amount: number;
}

class GenerateKeysRequest {
    @IsNotEmpty()
    @IsString()
    @IsSteemAddress()
    name: string;

    @IsNotEmpty()
    @IsString()
    password: string;
}

@JsonController("/accounts")
export class AddressesController {

    constructor(private steemService: SteemService) {
    }

    @Post("/create")
    async create(@Body() request: CreateRequest) {
        if (await this.steemService.accountExists(request.account)) {
            throw new BlockchainError(409, `Account [${request.account}] already exists`);
        }

        return await this.steemService.accountCreate(
            request.creator, 
            request.creatorActivePrivateKey,
            request.account,
            request.accountPassword,
            request.fee);
    }

    @Post("/delegateVestingShares")
    async delegateVestingShares(@Body() request: DelegateVestingSharesRequest) {
        return await this.steemService.delegateVestingShares(
            request.delegator, 
            request.delegatorActivePrivateKey,
            request.delegatee,
            request.vestingShares);
    }

    @Post("/generateKeys")
    async generateKeys(@Body() request: GenerateKeysRequest) {
        return await this.steemService.generateKeys(request.name, request.password);
    }

    @Post("/transferToVesting")
    async transferToVesting(@Body() request: TransferToVestingRequest) {
        return await this.steemService.transferToVesting(
            request.from,
            request.fromActivePrivateKey,
            request.to,
            request.amount);
    }
}