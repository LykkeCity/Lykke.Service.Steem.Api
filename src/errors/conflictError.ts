import { BlockchainError } from "./blockchainError";

export class ConflictError extends BlockchainError {

    constructor(message?: string) {
        super({ status: 409, message: message });
    }

}