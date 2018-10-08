import { JsonController, Get, Post, Body } from "routing-controllers";
import { IsSteemAddress } from "../common";
import { SteemService } from "../services/steemService";
import { IsString, IsOptional, IsNotEmpty } from "class-validator";
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

        return await this.steemService.accountCreate(request.creator,
            request.creatorActivePrivateKey, request.account, request.accountPassword, request.fee);
    }

    @Post("/generateKeys")
    async keys(@Body() request: GenerateKeysRequest) {
        return await this.steemService.generateKeys(request.name, request.password);
    }
}