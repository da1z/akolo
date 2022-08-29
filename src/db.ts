import { Low, JSONFile, Adapter } from "lowdb";
import { logger } from "./logger.js";
import { existsSync, mkdirSync } from "fs";

type FollowedEntry = {
    ts: number;
};
interface JsonData {
    followed: {
        [key: string]: FollowedEntry;
    };
}
interface Data {
    followed: Map<string, FollowedEntry>;
}
class DBAdapter implements Adapter<Data> {
    private jsonAdapter: JSONFile<JsonData>;
    constructor(path: string) {
        this.jsonAdapter = new JSONFile<JsonData>(path);
    }
    read = async () => {
        const jsonData = await this.jsonAdapter.read();
        if (jsonData) {
            return {
                ...jsonData,
                followed: new Map(Object.entries(jsonData.followed)),
            };
        }
        return null;
    };

    write(data: Data): Promise<void> {
        const jsonData = {
            ...data,
            followed: Object.fromEntries(data.followed),
        };
        return this.jsonAdapter.write(jsonData);
    }
}
export class DB {
    private db: Low<Data>;
    constructor(filename: string) {
        const dbDir = "./db";
        if (!existsSync(dbDir)) {
            mkdirSync(dbDir);
        }
        const adapter = new DBAdapter(`${dbDir}/${filename}`);
        this.db = new Low(adapter);
    }

    initialize = async () => {
        logger.info("initializing DB");
        await this.db.read();
        logger.info("db file red");

        this.db.data ??= {
            followed: new Map(),
        };
    };

    save = () => {
        return this.db.write();
    };

    get data() {
        if (!this.db.data) {
            throw new Error("DB not initialized");
        }
        return this.db.data;
    }
}
