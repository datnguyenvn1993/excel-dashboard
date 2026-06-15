import { SignJWT, jwtVerify } from "jose";

const SECRET_KEY = process.env.AUTH_SECRET || "default_auth_secret_for_dev_only_change_in_production";
const encodedKey = new TextEncoder().encode(SECRET_KEY);

interface SessionPayload {
    userId: number;
    role: string;
    username: string;
    display_name: string | null;
}

// ─── Token Utilities ────────────────────────────────────────────────────────
export async function createToken(payload: SessionPayload): Promise<string> {
    return new SignJWT(payload as any)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(encodedKey);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, encodedKey, {
            algorithms: ["HS256"],
        });
        return payload as unknown as SessionPayload;
    } catch (error) {
        return null;
    }
}

// ─── Password Utilities (Web Crypto API - Edge compatible) ───────────────────

function buf2hex(buffer: ArrayBuffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

function hex2buf(hex: string) {
    const bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes.buffer;
}

export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );

    const hashBuffer = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256",
        },
        keyMaterial,
        512 // 64 bytes
    );

    return buf2hex(salt.buffer) + ":" + buf2hex(hashBuffer);
}

export async function verifyPassword(password: string, storedHashStr: string): Promise<boolean> {
    if (!storedHashStr || !storedHashStr.includes(':')) return false;
    const [saltHex, hashHex] = storedHashStr.split(":");
    const salt = hex2buf(saltHex);
    const storedHash = hex2buf(hashHex);

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );

    const computedHashBuffer = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256",
        },
        keyMaterial,
        512
    );

    const computedHex = buf2hex(computedHashBuffer);
    return computedHex === hashHex;
}
