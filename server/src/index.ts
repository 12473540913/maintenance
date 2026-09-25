import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "node:path";
import dotenv from "dotenv";
import { ZodError } from "zod";
import { requireAuth } from "./auth.js";
import { crudRouter } from "./routes/crud.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { machinesRouter } from "./routes/machines.js";
import { validationRouter } from "./routes/validation.js";

dotenv.config({ path: [path.resolve(process.cwd(), "../.env.development"), path.resolve(process.cwd(), "../.env")] });

const app = express();
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()) : null;
app.use(cors({ origin: allowedOrigins ? (origin, callback) => { if (!origin || allowedOrigins.includes(origin)) callback(null, true); else callback(new Error(`CORS: origin ${origin} not allowed`)); } : true, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));
app.use(cookieParser());
const authBaseUrl = (process.env.AUTH_BASE_URL ?? process.env.VITE_AUTH_BASE_URL ?? "").trim();
if (authBaseUrl) {
	app.use("/auth", createProxyMiddleware({ target: authBaseUrl, changeOrigin: true, secure: true, cookieDomainRewrite: "" }));
}
app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", requireAuth);
app.use("/api/validation-values", validationRouter);
app.use("/api", crudRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/machines", machinesRouter);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error instanceof ZodError ? 400 : 500).json({ error: error.message }));

const webDist = path.resolve(process.cwd(), "../frontend/dist");
app.use(express.static(webDist));
app.get("/{*path}", (_req, res) => res.sendFile(path.join(webDist, "index.html")));

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Maintenance API listening on http://localhost:${port}`));
