import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io;

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-do-not-use-in-prod";

export const initSocket = async (server) => {
    console.log("🔌 Initializing Socket.io (Multi-Tenant)...");

    const allowedOrigins = process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(",").map(o => o.trim())
        : ["http://localhost:3000", "http://localhost:5173"];

    io = new Server(server, {
        cors: {
            origin: process.env.NODE_ENV === "production" ? allowedOrigins : "*",
            methods: ["GET", "POST"]
        }
    });

    // Authenticate socket connections via JWT
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                socket.userId = decoded.userId;
            } catch (e) {
                // Allow anonymous connections (for public pairing pages, etc.)
                console.log("📡 Anonymous socket connection.");
            }
        }
        next();
    });

    io.on("connection", (socket) => {
        console.log(`📡 Client connected: ${socket.id} (user: ${socket.userId || "anonymous"})`);

        // Join user-specific room
        if (socket.userId) {
            socket.join(`user:${socket.userId}`);
        }

        socket.on("disconnect", () => {
            console.log(`📡 Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
};

/**
 * Emit event to a specific user's room
 */
export const emitToUser = (userId, event, data) => {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    }
};

/**
 * Emit event globally or to a specific socket
 */
export const emitUpdate = (event, data) => {
    if (io) io.emit(event, data);
};
