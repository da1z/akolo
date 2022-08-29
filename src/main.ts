import { chromium, Page } from "playwright";
import { logger } from "./logger.js";
import { delay, shuffle } from "./utils.js";
import { DB } from "./db.js";

const options = {
    userName: "USERNAME",
    password: "PASSWORD",
};

interface AkoloOptions {
    userName: string;
    password: string;
}
const BASE_URL = "https://www.instagram.com/";
class Akolo {
    private page!: Page;
    db = new DB(this.options.userName + ".json");
    constructor(private options: AkoloOptions) {}

    start = async () => {
        await this.db.initialize();
        const browser = await chromium.launchPersistentContext(
            "./context-data",
            {
                headless: false,
                channel: "chrome",
                viewport: {
                    width: 500,
                    height: 1000,
                },
            }
        );
        this.page = browser.pages()[0];
        this.db.data.followed.set("test", { ts: Date.now() });
    };

    login = async () => {
        await this.page.goto(`${BASE_URL}accounts/login/`);
        const { userName, password } = this.options;
        await this.page
            .locator('input[name="username"]')
            .type(userName, { delay: 100 });
        await delay();
        await this.page
            .locator('input[name="password"]')
            .type(password, { delay: 100 });
        const navigation = this.page.waitForNavigation();
        await this.page
            .locator('button:has-text("Log In")[type=submit]')
            .click();
        await navigation;
    };

    getFollowing = async (
        userNames: string[],
        { maxFollowing }: { maxFollowing: number } = { maxFollowing: 100 }
    ) => {
        const result: string[] = [];
        for (const userName of userNames) {
            logger.info(`getting following for ${userName}`);
            await this.page.goto(`${BASE_URL}${userName}`);
            await delay();
            await this.page.locator('a:has-text("following")').click();
            await delay();
            const contentContainer = this.page.locator("div ._aano");
            const followers = contentContainer.locator("> div > div > div");
            for (let i = 0; i < maxFollowing; i++) {
                if (i >= (await followers.count())) {
                    break;
                }
                const follower = followers.nth(i);
                await follower.waitFor({
                    state: "attached",
                });
                await follower.scrollIntoViewIfNeeded();
                await delay();
                const followerUserName = await follower
                    .locator("> div >> nth=1 >> a")
                    .textContent();
                if (followerUserName) {
                    logger.info("found following", followerUserName);
                    result.push(followerUserName.replace(/Verified$/, ""));
                }
            }
        }
        return result;
    };

    getLikers = async (
        userNames: string[],
        {
            postsPerUser,
            likersPerPost,
            totalLikers,
        }: {
            postsPerUser: number;
            likersPerPost: number;
            totalLikers: number;
        } = {
            postsPerUser: 3,
            likersPerPost: 100,
            totalLikers: 100,
        }
    ) => {
        const result: string[] = [];
        for (const userName of shuffle(userNames)) {
            logger.info("Getting Likers for", userName);
            await this.withNavigation(this.page.goto(`${BASE_URL}${userName}`));
            await delay();
            const container = this.page.locator("article > div > div");
            // TODO check for pinned posts
            for (
                let rowIndex = 1;
                rowIndex < Math.floor(postsPerUser / 3 + 1);
                rowIndex++
            ) {
                const row = container.locator(`> div >> nth=${rowIndex}`);
                await row.scrollIntoViewIfNeeded();
                const posts = row.locator("> div");
                await delay();
                for (let i = 0; i < Math.min(await posts.count(), 3); i++) {
                    await this.withNavigation(posts.nth(i).click());
                    await delay();
                    result.push(
                        ...(await this.getLikersForPost(this.page.url(), {
                            maxLikers: likersPerPost,
                        }))
                    );
                    await delay();
                    await this.withNavigation(
                        this.page
                            .locator(
                                'div[role="button"]:has(svg > title:text("close"))'
                            )
                            .click()
                    );
                    await delay();
                    if (result.length >= totalLikers) {
                        logger.info(
                            "Desiread amount of likers reached",
                            result.length
                        );
                        return result;
                    }
                }
            }
        }
        return result;
    };

    getLikersForPost = async (
        url: string,
        { maxLikers }: { maxLikers: number } = { maxLikers: 100 }
    ) => {
        if (url != this.page.url()) {
            //todo navigate
        }
        await this.page
            .locator('a:has-text("Likes"), a:has-text(" others")')
            .click();

        const response = await this.page.waitForResponse(async (response) => {
            if (response.url().includes("/likers/")) {
                return true;
            }
            return false;
        });

        const likers: { users: { username: string }[] } = await response.json();
        await delay();
        await this.page
            .locator(
                'div:has-text("likes") button:has(svg[aria-label="Close"])'
            )
            .click();
        await delay();
        return likers.users.slice(0, maxLikers).map(({ username }) => username);
    };

    followUsers = async (
        userNames: string[],
        { limit }: { limit: number } = { limit: 100 }
    ) => {
        let leftToFollow = limit;
        for (const userName of shuffle(userNames)) {
            const success = await this.followUser(userName);
            await delay(60);
            if (success) {
                leftToFollow--;
                if (leftToFollow <= 0) {
                    logger.info("Follow limit reached", limit);
                    break;
                }
            }
        }
    };

    followUser = async (userName: string) => {
        logger.info("Trying to follow", userName);
        if (this.db.data.followed.has(userName)) {
            logger.info("Skipping: already followed in the past", userName);
            return false;
        }
        await this.withNavigation(this.page.goto(`${BASE_URL}${userName}`));
        await delay();
        const incorrectUserName = await this.page
            .locator('h2:text("Sorry, this page isn\'t available.")')
            .isVisible();
        if (incorrectUserName) {
            logger.info("No user found with name", userName);
            return false;
        }
        const requested = this.page.locator('button:has-text("Requested")');
        if (await requested.isVisible()) {
            logger.info("Already requested", userName);
            // TODO: cancel requested after certain amount of time
            return false;
        }
        const following = this.page.locator(
            "button:has(svg[aria-label='Following'])"
        );
        if (await following.isVisible()) {
            logger.info("Already following", userName);
            return false;
        }
        await delay();
        const follow = this.page.locator('header button:has-text("Follow")');
        if (await follow.isVisible()) {
            await follow.click();
            this.db.data.followed.set(userName, { ts: Date.now() });
        } else {
            logger.warn("Could not find follow button for", userName);
            return false;
        }
        logger.info("Followed", userName);
        return true;
    };

    dispose = async () => {
        await this.db.save();
        logger.info("db saved");
        await this.page.context().close();
    };

    private withNavigation = <T>(promise: Promise<T>) => {
        return Promise.all([this.page.waitForNavigation(), promise]);
    };
}
const competitors = [
    "kashyapgaddam",
    "money_chasa_kb",
    "wasted",
    "girlyzar",
    "ight",
    "unilad",
    "advice",
    "raddad",
    "britishmemes",
    "memelord",
    "ftb",
    "memes",
    "jokezar",
    "shitheadsteve",
    "sarcasm_only",
    "nugget",
    "todayyearsold",
    "dadsaysjokes",
    "thegoodquote",
    "9gag",
    "memezar",
    "pubity",
];
// private account kushplanet
(async () => {
    const akolo = new Akolo(options);
    await akolo.start();
    try {
        // await akolo.login();
        const likers = await akolo.getLikers(competitors);
        await akolo.followUsers(likers, { limit: 20 });
    } finally {
        await akolo.dispose();
    }
})();
