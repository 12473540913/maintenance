import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");

	return {
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
