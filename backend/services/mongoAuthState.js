import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import WhatsAppAuth from "../models/WhatsAppAuth.js";

/**
 * Custom Baileys Authentication Provider mapped to MongoDB.
 * 
 * Replaces the default `useMultiFileAuthState` which writes `creds.json`
 * and other keys to the local filesystem.
 * 
 * @param {string} sessionId The unique node matching `WhatsAppSession._id`
 * @returns {Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }>}
 */
export const useMongoDBAuthState = async (sessionId) => {
    const normalizedSessionId = String(sessionId);

    // 1. Helper to fetch data
    const readData = async (type, id = "") => {
        try {
            const doc = await WhatsAppAuth.findOne({ sessionId: normalizedSessionId, type, id });
            if (doc && doc.data) {
                return JSON.parse(doc.data, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error(`[MongoAuth] Failed to read ${type} ${id}:`, error);
            return null;
        }
    };

    // 2. Helper to write data
    const writeData = async (data, type, id = "") => {
        try {
            const dataString = JSON.stringify(data, BufferJSON.replacer);
            await WhatsAppAuth.updateOne(
                { sessionId: normalizedSessionId, type, id },
                { $set: { data: dataString } },
                { upsert: true }
            );
        } catch (error) {
            console.error(`[MongoAuth] Failed to write ${type} ${id}:`, error);
        }
    };

    // 3. Helper to delete data
    const removeData = async (type, id = "") => {
        try {
            await WhatsAppAuth.deleteOne({ sessionId: normalizedSessionId, type, id });
        } catch (error) {
            console.error(`[MongoAuth] Failed to delete ${type} ${id}:`, error);
        }
    };

    // Fetch initial credentials
    let creds = await readData("creds");
    if (!creds) {
        creds = initAuthCreds();
        await writeData(creds, "creds");
    }

    const state = {
        creds,
        keys: {
                // Return a specific key from DB
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(type, id);
                            if (type === "app-state-sync-key" && value) {
                                const baileys = await import("@whiskeysockets/baileys");
                                value = baileys.proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                // Write multiple keys to DB
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            if (value) {
                                tasks.push(writeData(value, category, id));
                            } else {
                                // If value is null, delete the key
                                tasks.push(removeData(category, id));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        };

    return {
        state,
        saveCreds: () => writeData(state.creds, "creds")
    };
};
