import { EventEmitter } from "events";
import { emitToUser } from "./socketService.js";

const MAX_CONCURRENT_PAIRINGS = 3;

class QueueService extends EventEmitter {
    constructor() {
        super();
        this.queue = []; // Array of { userId, phoneNumber, method, socketId }
        this.activePairings = new Set(); // Set of userIds currently pairing
    }

    /**
     * @returns {number} Position in queue (1-based), or 0 if active.
     */
    add(userId, phoneNumber, method, socketId) {
        // If already active, return 0
        if (this.activePairings.has(userId)) {
            return 0;
        }

        // Check if already in queue, update socketId if so
        const existingIndex = this.queue.findIndex(item => item.userId === userId);
        if (existingIndex !== -1) {
            this.queue[existingIndex].socketId = socketId;
            return existingIndex + 1; // 1-based position
        }

        // Add to queue
        this.queue.push({ userId, phoneNumber, method, socketId });
        console.log(`[Queue] Added user ${userId} to queue. Position: ${this.queue.length}`);

        // Broadcast queue update to the new user
        this.broadcastQueuePosition(userId);

        this.processQueue();

        // Return position of the newly added item
        return this.queue.length;
    }

    remove(userId) {
        const initialLength = this.queue.length;
        this.queue = this.queue.filter(item => item.userId !== userId);
        if (this.queue.length < initialLength) {
            console.log(`[Queue] Removed user ${userId} from queue.`);
            this.broadcastAllPositions();
        }
    }

    finishPairing(userId) {
        if (this.activePairings.has(userId)) {
            this.activePairings.delete(userId);
            console.log(`[Queue] Slot freed. Active: ${this.activePairings.size}/${MAX_CONCURRENT_PAIRINGS}`);
            this.processQueue();
        }
    }

    getActiveCount() {
        return this.activePairings.size;
    }

    getQueuePosition(userId) {
        if (this.activePairings.has(userId)) return 0;
        const index = this.queue.findIndex(item => item.userId === userId);
        return index !== -1 ? index + 1 : -1;
    }

    processQueue() {
        if (this.activePairings.size >= MAX_CONCURRENT_PAIRINGS) {
            return; // At capacity
        }

        if (this.queue.length === 0) {
            return; // Nobody waiting
        }

        const nextItem = this.queue.shift();
        this.activePairings.add(nextItem.userId);

        console.log(`[Queue] Starting pairing for user ${nextItem.userId}. Active: ${this.activePairings.size}/${MAX_CONCURRENT_PAIRINGS}`);

        // Notify others their position moved up
        this.broadcastAllPositions();

        // Notify this user it's their turn
        emitToUser(nextItem.userId, "queue_ready", { message: "Your turn has arrived!" });

        // Start actual pairing process in the background
        this.startSessionPairing(nextItem);
    }

    async startSessionPairing(item) {
        try {
            // Import lazily to avoid circular dependencies
            const { sessionManager } = await import("./whatsappService.js");

            // This is equivalent to what /sessions/pair used to do directly
            await sessionManager.startPairing(item.userId, item.phoneNumber, item.method, item.socketId);

            // Note: startPairing itself sets up events that eventually call finishPairing
            // when QR is scanned, code is submitted, or timeout/error occurs.
        } catch (error) {
            console.error(`[Queue] Error starting pairing for ${item.userId}:`, error);
            this.finishPairing(item.userId);
            emitToUser(item.userId, "pairing_error", { error: "Failed to start pairing process. Please try again." });
        }
    }

    broadcastQueuePosition(userId) {
        const item = this.queue.find(i => i.userId === userId);
        if (item) {
            const position = this.getQueuePosition(userId);
            emitToUser(userId, "queue_update", { position });
        }
    }

    broadcastAllPositions() {
        this.queue.forEach((item, index) => {
            emitToUser(item.userId, "queue_update", { position: index + 1 });
        });
    }
}

export const queueService = new QueueService();
