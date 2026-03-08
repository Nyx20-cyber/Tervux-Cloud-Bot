import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
    console.error("❌ FATAL: JWT_SECRET environment variable is not set!");
    process.exit(1);
}
const effectiveSecret = JWT_SECRET || "dev-only-secret-do-not-use-in-prod";

/**
 * Generate JWT token for a user
 */
export function generateToken(userId) {
    return jwt.sign({ userId }, effectiveSecret, { expiresIn: "30m" });
}

/**
 * Authenticate — verify JWT and attach req.user
 */
export async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, effectiveSecret);
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        if (user.isBanned) {
            return res.status(403).json({ error: "Your account is suspended by administrator. Please contact support." });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Invalid or expired token" });
        }
        return res.status(500).json({ error: "Authentication failed" });
    }
}

/**
 * Require admin role
 */
export function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
}

// get rid of requireActiveSubscription as sub is per session
