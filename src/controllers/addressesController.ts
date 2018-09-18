import { JsonController, Get, Param } from "routing-controllers";
import { NotImplementedError } from "../errors/notImplementedError";
import { isSteemAddress, ParamIsSteemAddress } from "../common";

@JsonController("/addresses")
export class AddressesController {

    constructor() {
    }

    @Get("/:address/explorer-url")
    explorerUrl(@ParamIsSteemAddress("address") address: string) {
        throw new NotImplementedError();
    }

    @Get("/:address/validity")
    isValid(@Param("address") address: string) {
        return {
            isValid: isSteemAddress(address)
        };
    }
}