import { logger } from "./logger.js";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const delay = (duration = 1) => {
    const ms = random(1000, 2000) * duration;
    if (ms > 5000) {
        logger.info(`Delaying for ${ms / 1000}s`);
    }
    return sleep(random(500, 1000) * duration);
};
export const shuffle = <T>(a: T[]) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
};
