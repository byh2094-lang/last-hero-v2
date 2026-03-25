import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("[auth] JWT_SECRET environment variable is required but not set. Set it before starting the server.");
}
const EFFECTIVE_SECRET = JWT_SECRET;

export interface JwtPayload {
  id: number;
  phone: string;
  role: "seller" | "admin";
}

declare global {
  namespace Express {
    interface Request {
      seller?: JwtPayload;
      admin?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, EFFECTIVE_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, EFFECTIVE_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function requireSeller(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "인증이 필요합니다" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload || payload.role !== "seller") {
    res.status(401).json({ error: "Unauthorized", message: "판매자 인증이 필요합니다" });
    return;
  }
  req.seller = payload;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "인증이 필요합니다" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload || payload.role !== "admin") {
    res.status(401).json({ error: "Unauthorized", message: "관리자 인증이 필요합니다" });
    return;
  }
  req.admin = payload;
  next();
}
