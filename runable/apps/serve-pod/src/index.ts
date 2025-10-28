import "dotenv/config";

console.log("Global POD started with env:", {
	NODE_ENV: process.env.NODE_ENV,
	CORS_ORIGIN: process.env.CORS_ORIGIN,
});

