import type express from "express";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getDb } from "./db/mongo.js";

const APP_ID = "maintenance";
const ISSUER = "auth-service";

function getAuthCookieName(): string {
  return process.env.AUTH_COOKIE_NAME?.trim() || "auth_session";
}

type AuthTokenPayload = {
  sub: string;
  email: string;
  tokenVersion: number;
};

function verifyAuthToken(token: string): AuthTokenPayload {
  const jwtSecret = process.env.JWT_SECRET?.trim() || "";
  if (!jwtSecret) {
    throw new Error("Missing JWT_SECRET. Set it to the same value configured in auth-service.");
  }

  const decoded = jwt.verify(token, jwtSecret, {
    audience: APP_ID,
    issuer: ISSUER
  }) as jwt.JwtPayload;

  return {
    sub: String(decoded.sub),
    email: String(decoded.email),
    tokenVersion: Number(decoded.tokenVersion)
  };
}

async function getAuthenticatedUser(payload: AuthTokenPayload): Promise<{ id: string; email: string } | null> {
  if (!ObjectId.isValid(payload.sub)) return null;
  const user = await (await getDb()).collection("users").findOne({
    _id: new ObjectId(payload.sub),
    authVersion: payload.tokenVersion
  });

  if (!user) return null;
  return { id: user._id.toString(), email: String(user.email) };
}

export async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  const token = req.cookies?.[getAuthCookieName()] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const user = await getAuthenticatedUser(payload);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.locals.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}