import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
	const envDir = path.resolve(process.cwd(), "..");
	const env = loadEnv(mode, envDir, "");

	return {
		envDir,
		plugins: [react()],
		server: {
			proxy: {
				"/api": "http://localhost:8787",
				"/auth": {
					target: env.VITE_AUTH_BASE_URL || "https://auth.lnks.info",
					changeOrigin: true,
					secure: true,
					cookieDomainRewrite: ""
				}
			}
		}
	};
});
