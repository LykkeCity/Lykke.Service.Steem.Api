import { JsonController, Get, Param } from "routing-controllers";
import { NotImplementedError } from "../errors/notImplementedError";
import { isSteemAddress, ParamIsSteemAddress, ADDRESS_SEPARATOR } from "../common";
import { SteemService } from "../services/steemService";

@JsonController("/addresses")
export class AddressesController {

    constructor(private steemService: SteemService) {
    }

    @Get("/:address/explorer-url")
    explorerUrl(@ParamIsSteemAddress("address") address: string) {
        throw new NotImplementedError();
    }

    @Get("/:address/validity")
    async isValid(@Param("address") address: string) {
        return {
            isValid: isSteemAddress(address) &&
                await this.steemService.accountExists(address.split(ADDRESS_SEPARATOR)[0])
        };
    }
}