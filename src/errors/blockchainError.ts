import { HttpError } from "routing-controllers";
import { ErrorCode } from "../domain/operations";

export class BlockchainError extends HttpError {

    constructor(params: { status?: number, message?: string, errorCode?: ErrorCode, data?: any }) {
        super(params.status || 500, params.message);
        this.errorCode = params.errorCode || ErrorCode.unknown;
        this.data = params.data;
    }

    errorCode: ErrorCode;
    data: any;
}