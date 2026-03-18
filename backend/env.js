import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1) Primary local/backend env file.
dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

// 2) Docker/deploy fallback should only load for production-like runs.
// Loading deploy env during local development can leak docker-only hosts like
// `redis` into a normal machine process and cause noisy connection failures.
const shouldLoadDeployFallback =
    process.env.NODE_ENV === "production" ||
    process.env.LOAD_DEPLOY_ENV === "true";

if (shouldLoadDeployFallback) {
    dotenv.config({ path: path.join(__dirname, "../deploy/env/backend.env"), quiet: true });
}

// TLS verification enabled - only disable if you have certificate issues
// if (process.env.NODE_ENV !== "production") {
//     process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// }

export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = process.env.PORT || 5000;
