import { BlockchainError } from "./blockchainError";

export class NotImplementedError extends BlockchainError {

    constructor(message?: string) {
        super({ status: 501, message: message });
    }

}