let redisClient = null;
let redisReady = false;
let warnedMissingRedisPkg = false;

const REDIS_URL = process.env.REDIS_URL || "";

export const isRedisReady = () => redisReady && !!redisClient;

export const getRedisClient = () => (isRedisReady() ? redisClient : null);

export const initRedis = async () => {
    if (!REDIS_URL) {
        console.warn("🟡 Redis disabled: REDIS_URL not set.");
        return null;
    }

    if (redisClient) return redisClient;

    try {
        const redisMod = await import("redis");
        const client = redisMod.createClient({ url: REDIS_URL });

        client.on("error", (err) => {
            redisReady = false;
            console.error("❌ Redis error:", err?.message || err);
        });

        client.on("ready", () => {
            redisReady = true;
            console.log("✅ Redis connected.");
        });

        client.on("end", () => {
            redisReady = false;
            console.warn("🟡 Redis connection ended.");
        });

        await client.connect();
        redisClient = client;
        return redisClient;
    } catch (error) {
        if (error?.code === "ERR_MODULE_NOT_FOUND" && !warnedMissingRedisPkg) {
            warnedMissingRedisPkg = true;
            console.warn("🟡 Redis package not installed. Run: npm i redis");
        } else {
            console.warn("🟡 Redis unavailable, app will continue without cache:", error?.message || error);
        }
        redisClient = null;
        redisReady = false;
        return null;
    }
};

export const closeRedis = async () => {
    if (!redisClient) return;
    try {
        await redisClient.quit();
    } catch (error) {
        console.warn("Redis close warning:", error?.message || error);
    } finally {
        redisClient = null;
        redisReady = false;
    }
};

export const getJson = async (key) => {
    const client = getRedisClient();
    if (!client) return null;
    try {
        const value = await client.get(key);
        if (!value) return null;
        return JSON.parse(value);
    } catch (error) {
        console.warn(`Redis GET ${key} failed:`, error?.message || error);
        return null;
    }
};

export const setJson = async (key, value, ttlSeconds = 30) => {
    const client = getRedisClient();
    if (!client) return;
    try {
        await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch (error) {
        console.warn(`Redis SET ${key} failed:`, error?.message || error);
    }
};

export const delKey = async (key) => {
    const client = getRedisClient();
    if (!client) return;
    try {
        if (typeof key === "string" && key.includes("*")) {
            const matchedKeys = [];
            for await (const foundKey of client.scanIterator({ MATCH: key, COUNT: 100 })) {
                matchedKeys.push(foundKey);
            }
            if (matchedKeys.length > 0) {
                await client.del(matchedKeys);
            }
            return;
        }

        await client.del(key);
    } catch (error) {
        console.warn(`Redis DEL ${key} failed:`, error?.message || error);
    }
};
