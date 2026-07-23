import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Anyone who knows JWT_SECRET can forge a valid session for any user —
// knowing this repo's own .env.example values would be enough if a
// production deploy ever left them unchanged. Checked only when
// NODE_ENV=production so local/dev setups (which legitimately use a short,
// well-known secret) aren't affected.
function isWeakOrPlaceholder(value: string): boolean {
  return /change[_-]?me/i.test(value) || Buffer.byteLength(value, "utf8") < 32;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtSecret = required("JWT_SECRET");
if (nodeEnv === "production" && isWeakOrPlaceholder(jwtSecret)) {
  throw new Error(
    "JWT_SECRET is missing, a CHANGE_ME placeholder, or shorter than 32 bytes — refusing to start in production. Set a strong random value."
  );
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
