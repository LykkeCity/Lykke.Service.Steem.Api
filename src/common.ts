import { getMetadataArgsStorage, Action, BadRequestError } from "routing-controllers";
import { ParamType } from "routing-controllers/metadata/types/ParamType";
import { Container } from "typedi";
import { registerDecorator } from "class-validator";
import { isString, promisify, isNumber } from "util";
import axios from "axios";
import fs from "fs";
import * as appInsights from "applicationinsights";

const pkg = require("../package.json");
const steem = require("steem");
const uuidRegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positiveIntegerRegExp = /^[1-9]\d*$/;
const azureKeyInvalidCharsRegExp = /[\/\\#?\n\r\t\u0000-\u001F\u007F-\u009F]/gmi;

export const APP_NAME = pkg.name;

export const APP_VERSION = pkg.version;

export const ENV_INFO = process.env.ENV_INFO;

export const ADDRESS_SEPARATOR = "$";

export enum Encoding {
    base64 = "base64",
    utf8 = "utf8"
};

/**
 * Serializes object to JSON and then encodes result to base64
 * @param obj Object to serialize to JSON and encode to base64
 */
export function toBase64(obj: any): string {
    return Buffer.from(JSON.stringify(obj)).toString(Encoding.base64);
}

/**
 * Converts base64 string to JSON and then parses result to `T`
 * @param str String in base64 encoding
 */
export function fromBase64<T>(str: string): T {
    return JSON.parse(Buffer.from(str, Encoding.base64).toString(Encoding.utf8)) as T;
}

/**
 * Application settings.
 * Defined as `class` instead of `interface` to make DI easier (no need of Token<Service>)
 */
export class Settings {
    SteemApi: {
        Azure: {
            ConnectionString: string;
        },
        Mongo: {
            ConnectionString: string;
            User: string;
            Password: string;
            Database: string;
        },
        LogAdapterUrl: string;
        LogSlackChannels: string[];
        Steem: {
            ExpireInSeconds: number;
            Url: string;
            UseAppbaseApi: boolean;
        }
    };
}

/**
 * Loads application settings from file or URL as specified in `SettingsUrl` environment variable.
 */
export async function loadSettings(): Promise<Settings> {
    if (process.env.SettingsUrl.startsWith("http")) {
        return (await axios.get<Settings>(process.env.SettingsUrl)).data;
    } else {
        return JSON.parse(await promisify(fs.readFile)(process.env.SettingsUrl, Encoding.utf8)) as Settings;
    }
}

export function isoUTC(iso: string): Date {
    iso = iso.endsWith("Z")
        ? iso
        : `${iso}Z`;

    return new Date(iso);
}

export function isUuid(str: string): boolean {
    return !!str && uuidRegExp.test(str);
}

export function isSteemAddress(str: string): boolean {
    if (!str || azureKeyInvalidCharsRegExp.test(str)) {
        return false;
    }

    const parts = str.split(ADDRESS_SEPARATOR);
    const error = steem.utils.validateAccountName(parts[0]);

    if (!!error || (!!parts[1] && parts[1].length > 256)) {
        return false;
    }

    return true;
}

export function isPositiveInteger(value: number | string): boolean {
    if (isNumber(value)) {
        return Number.isInteger(value) && value > 0;
    } else {
        return positiveIntegerRegExp.test(value);
    }
}

/**
 * Class property validation decorator to check EOS address
 * @param name Paremeter name
 */
export function IsSteemAddress() {
    return function(object: Object, propertyName: string) {
        registerDecorator({
            name: "IsSteemAddress",
            target: object.constructor,
            propertyName: propertyName,
            validator: {
                defaultMessage() {
                    return `Property [${propertyName}] is invalid, must be valid STEEM account with optional extension.`
                },
                validate(val: any) {
                    return isString(val) && isSteemAddress(val);
                }
            }
        });
    };
}

/**
 * Returns decorator function which adds action parameter metadata to routing-controllers metadata store,
 * so that parameter can be checked and validated at runtime.
 * @param options Parameter metadata
 */
export function createParamDecorator(options: { type: ParamType, name: string, required: boolean, parse: boolean, transform?: (action: Action, value?: any) => Promise<any> | any }) {
    return (object: any, method: string, index: number) => {
        getMetadataArgsStorage().params.push({
            object: object,
            method: method,
            index: index,
            ...options
        });
    };
}

/**
 * Route parameter validation decorator to check UUID
 * @param name Paremeter name
 */
export function ParamIsUuid(name: string) {
    return createParamDecorator({
        type: "param",
        name: name,
        required: true,
        parse: false,
        transform: action => {
            if (isUuid(action.context.params[name])) {
                return action.context.params[name];
            } else {
                return Promise.reject(new BadRequestError(`Route parameter [${name}] is invalid, must be UUID.`));
            }
        }
    });
}

/**
 * Route parameter validation decorator to check EOS address
 * @param name Paremeter name
 */
export function ParamIsSteemAddress(name: string) {
    return createParamDecorator({
        type: "param",
        name: name,
        required: true,
        parse: false,
        transform: action => {
            if (isSteemAddress(action.context.params[name])) {
                return action.context.params[name];
            } else {
                return Promise.reject(new BadRequestError(`Route parameter [${name}] is invalid, must be valid STEEM account with optional extension.`));
            }
        }
    });
}

/**
 * Query parameter validation decorator to check positive integer
 * @param name Paremeter name
 */
export function QueryParamIsPositiveInteger(name: string) {
    return createParamDecorator({
        type: "query",
        name: name,
        required: true,
        parse: false,
        transform: action => {
            if (isPositiveInteger(action.context.query[name])) {
                return parseInt(action.context.query[name]);
            } else {
                return Promise.reject(new BadRequestError(`Query parameter [${name}] is invalid, must be positive integer.`));
            }
        }
    });
}

export function startAppInsights() {
    if (!process.env["APPINSIGHTS_INSTRUMENTATIONKEY"]) {
        console.warn("APPINSIGHTS_INSTRUMENTATIONKEY is not provided");
        return;
    }

    // init with default configuration
    appInsights.setup()
        .setAutoDependencyCorrelation(true)
        .setAutoCollectRequests(true)
        .setAutoCollectPerformance(true)
        .setAutoCollectExceptions(true)
        .setAutoCollectDependencies(true)
        .setAutoCollectConsole(true)
        .setUseDiskRetryCaching(true)
        .start();

    // register client in DI container
    // so it could be used by services
    Container.set(appInsights.TelemetryClient, appInsights.defaultClient);
}