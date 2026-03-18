import "../env.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const AUTH_TRACE = process.env.AUTH_TRACE === "true" || process.env.NODE_ENV !== "production";
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
    console.error("❌ FATAL: JWT_SECRET environment variable is not set!");
    process.exit(1);
}
const effectiveSecret = JWT_SECRET || "dev-only-secret-do-not-use-in-prod";
const ACCESS_TOKEN_EXPIRES_IN = "24h";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE_NAME = "tervux_refresh_token";

const traceAuth = (message, details = {}) => {
    if (!AUTH_TRACE) return;
    console.info(`[AuthTrace][Middleware] ${message}`, details);
};

export function generateToken(userId) {
    return jwt.sign({ userId }, effectiveSecret, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

export function generateRefreshToken() {
    return crypto.randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function parseCookies(req) {
    const header = String(req.headers.cookie || "");
    if (!header) return {};
    return header.split(";").reduce((acc, part) => {
        const idx = part.indexOf("=");
        if (idx === -1) return acc;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (!key) return acc;
        acc[key] = decodeURIComponent(value);
        return acc;
    }, {});
}

export function setRefreshTokenCookie(res, token) {
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie(REFRESH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_TTL_MS,
        path: "/api/auth"
    });
}

export function clearRefreshTokenCookie(res) {
    res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/auth"
    });
}

export async function authenticate(req, res, next) {
    try {
        const requestPath = req.originalUrl || req.path || "";
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            traceAuth("Missing bearer token.", {
                path: requestPath,
                hasAuthHeader: Boolean(authHeader)
            });
            return res.status(401).json({ error: "Authentication required" });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, effectiveSecret);
        const user = await User.findById(decoded.userId);

        if (!user) {
            traceAuth("Token verified but user missing.", {
                path: requestPath,
                userId: decoded?.userId || null
            });
            return res.status(401).json({ error: "User not found" });
        }

        if (user.isBanned) {
            traceAuth("Blocked banned user.", {
                path: requestPath,
                userId: String(user._id)
            });
            return res.status(403).json({ error: "Your account is suspended by administrator. Please contact support." });
        }

        traceAuth("Authenticated request.", {
            path: requestPath,
            userId: String(user._id)
        });
        req.user = user;
        next();
    } catch (error) {
        traceAuth("Authentication failed.", {
            path: req.originalUrl || req.path || "",
            errorName: error?.name || "UnknownError",
            message: error?.message || ""
        });
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Invalid or expired token" });
        }
        return res.status(500).json({ error: "Authentication failed" });
    }
}

export function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
}

export { ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_TTL_MS };
