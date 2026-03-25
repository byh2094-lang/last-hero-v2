import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  sellersTable,
  bagsTable,
  ordersTable,
  pickupsTable,
  blacklistTable,
  type Bag,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { signToken, requireSeller } from "../lib/auth";
import { expireStaleOrders } from "../lib/expireOrders";

const router: IRouter = Router();

// ─── 판매자 로그인 (휴대폰 번호 + 비밀번호) ───
router.post("/seller/auth/login", async (req, res) => {
  try {
    const { phone, password } = req.body as { phone: string; password: string };
    if (!phone || !password) {
      res.status(400).json({ error: "Bad Request", message: "휴대폰 번호와 비밀번호를 입력해주세요" });
      return;
    }

    const [seller] = await db.select().from(sellersTable).where(eq(sellersTable.phone, phone));

    if (!seller) {
      res.status(401).json({
        error: "Unregistered",
        message: "미등록 판매자입니다. 관리자에게 입점 신청을 해주세요.",
      });
      return;
    }

    if (seller.approvalStatus === "cancelled") {
      res.status(403).json({
        error: "AccountCancelled",
        message: "계정이 취소되었습니다. 관리자에게 문의하세요.",
        suspendReason: seller.suspendReason,
      });
      return;
    }

    if (seller.password !== password) {
      res.status(401).json({ error: "InvalidPassword", message: "비밀번호가 올바르지 않습니다" });
      return;
    }

    const token = signToken({ id: seller.id, phone, role: "seller" });
    res.json({
      token,
      role: "seller",
      approvalStatus: seller.approvalStatus,
      suspendReason: seller.suspendReason ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 비밀번호 변경 ───
router.post("/seller/auth/change-password", requireSeller, async (req, res) => {
  try {
    const seller = req.seller!;
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Bad Request", message: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요" });
      return;
    }
    if (newPassword.length < 4) {
      res.status(400).json({ error: "Bad Request", message: "비밀번호는 4자리 이상이어야 합니다" });
      return;
    }

    const [profile] = await db.select().from(sellersTable).where(eq(sellersTable.id, seller.id));
    if (!profile) {
      res.status(404).json({ error: "Not Found", message: "판매자 정보를 찾을 수 없습니다" });
      return;
    }

    if (profile.password !== currentPassword) {
      res.status(401).json({ error: "InvalidPassword", message: "현재 비밀번호가 올바르지 않습니다" });
      return;
    }

    await db.update(sellersTable).set({ password: newPassword, updatedAt: new Date() }).where(eq(sellersTable.id, seller.id));
    res.json({ message: "비밀번호가 변경되었습니다" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 하위 호환: 기존 OTP 요청 (레거시 — 미사용) ───
router.post("/seller/auth/request", async (req, res) => {
  res.json({ message: "이 방식은 더 이상 사용되지 않습니다. 새 로그인 방식을 이용해주세요." });
});

// ─── 하위 호환: 기존 OTP 확인 (레거시 — 미사용) ───
router.post("/seller/auth/verify", async (req, res) => {
  res.status(410).json({ error: "Gone", message: "이 방식은 더 이상 사용되지 않습니다. 새 로그인 방식을 이용해주세요." });
});

// ─── 판매자 매장 정보 조회 ───
router.get("/seller/me", requireSeller, async (req, res) => {
  try {
    const seller = req.seller!;
    const [profile] = await db.select().from(sellersTable).where(eq(sellersTable.id, seller.id));
    if (!profile) {
      res.status(404).json({ error: "Not Found", message: "판매자 정보를 찾을 수 없습니다" });
      return;
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 판매자 매장 등록/수정 ───
router.post("/seller/me", requireSeller, async (req, res) => {
  try {
    const seller = req.seller!;
    const { storeName, address, bankAccount, latitude, longitude, district, showContact, contactPhone } = req.body as {
      storeName: string;
      address: string;
      bankAccount?: string;
      latitude?: number;
      longitude?: number;
      district?: string;
      showContact?: boolean;
      contactPhone?: string;
    };

    const [updated] = await db
      .update(sellersTable)
      .set({
        storeName, address, bankAccount, latitude, longitude, district,
        ...(showContact !== undefined && { showContact }),
        ...(contactPhone !== undefined && { contactPhone: contactPhone || null }),
        updatedAt: new Date(),
      })
      .where(eq(sellersTable.id, seller.id))
      .returning();

    res.status(201).json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 판매자 매장 수정 ───
router.put("/seller/me", requireSeller, async (req, res) => {
  try {
    const seller = req.seller!;
    const { storeName, address, bankAccount, latitude, longitude, district, showContact, contactPhone } = req.body as {
      storeName?: string;
      address?: string;
      bankAccount?: string;
      latitude?: number;
      longitude?: number;
      district?: string;
      showContact?: boolean;
      contactPhone?: string;
    };

    const [updated] = await db
      .update(sellersTable)
      .set({
        ...(storeName && { storeName }),
        ...(address && { address }),
        ...(bankAccount && { bankAccount }),
        ...(latitude !== undefined && { latitude }),
        ...(longitude !== undefined && { longitude }),
        ...(district && { district }),
        ...(showContact !== undefined && { showContact }),
        ...(contactPhone !== undefined && { contactPhone: contactPhone || null }),
        updatedAt: new Date(),
      })
      .where(eq(sellersTable.id, seller.id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 판매자 서프라이즈백 목록 ───
router.get("/seller/bags", requireSeller, async (req, res) => {
  try {
    const seller = req.seller!;
    const bags = await db.select().from(bagsTable).where(eq(bagsTable.sellerId, seller.id));
    res.json(bags);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 판매자 서프라이즈백 등록 ───
router.post("/seller/bags", requireSeller, async (req, res) => {
  try {
    const seller = req.seller!;
    const { type, price, originalPrice, quantity, closingTime, category, description, imageUrl } = req.body as {
      type: "free" | "paid";
      originalPrice?: number;
      price: number;
      quantity: number;
      closingTime: string;
      category?: string;
      description?: string;
      imageUrl?: string;
    };

    // 판매자 승인 확인
    const [sellerProfile] = await db.select().from(sellersTable).where(eq(sellersTable.id, seller.id));
    if (sellerProfile.approvalStatus !== "approved") {
      res.status(403).json({ error: "Forbidden", message: "승인된 판매자만 서프라이즈백을 등록할 수 있습니다" });
      return;
    }

    // 판매자별 최대 등록 금액 적용 (관리자 설정값, 기본 10,000원)
    const effectiveMaxPrice = sellerProfile.maxPrice ?? 10000;
    if (price > effectiveMaxPrice) {
      res.status(400).json({
        error: "Bad Request",
        message: `이 판매자의 최대 등록 금액은 ${effectiveMaxPrice.toLocaleString()}원입니다`,
      });
      return;
    }

    if (type === "free" && price !== 0) {
      res.status(400).json({ error: "Bad Request", message: "무료 백의 가격은 0원이어야 합니다" });
      return;
    }

    const [bag] = await db
      .insert(bagsTable)
      .values({
        sellerId: seller.id,
        type,
        originalPrice: type === "free" ? 0 : (originalPrice ?? price),
        price: type === "free" ? 0 : price,
        quantity,
        remainingQuantity: quantity,
        closingTime: new Date(closingTime),
        category,
        description,
        imageUrl,
      })
      .returning();

    res.status(201).json(bag);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 판매자 서프라이즈백 수정 ───
router.put("/seller/bags/:id", requireSeller, async (req, res) => {
  try {
    const seller = req.seller!;
    const bagId = parseInt(req.params.id as string, 10);
    const { price, quantity, closingTime, status, category } = req.body as {
      price?: number;
      quantity?: number;
      closingTime?: string;
      status?: Bag["status"];
      category?: string;
    };

    // 판매자 승인 확인 (등록과 동일한 기준 적용)
    const [sellerProfile] = await db.select().from(sellersTable).where(eq(sellersTable.id, seller.id));
    if (sellerProfile.approvalStatus !== "approved") {
      res.status(403).json({ error: "Forbidden", message: "승인된 판매자만 서프라이즈백을 수정할 수 있습니다" });
      return;
    }

    const [existing] = await db
      .select()
      .from(bagsTable)
      .where(and(eq(bagsTable.id, bagId), eq(bagsTable.sellerId, seller.id)));

    if (!existing) {
      res.status(404).json({ error: "Not Found", message: "해당 백을 찾을 수 없습니다" });
      return;
    }

    // 가격 유효성 검사 (등록과 동일한 기준 적용)
    if (price !== undefined && price > 10000) {
      res.status(400).json({ error: "Bad Request", message: "가격은 10,000원 이하여야 합니다" });
      return;
    }
    if (price !== undefined && existing.type === "free" && price !== 0) {
      res.status(400).json({ error: "Bad Request", message: "무료 백의 가격은 0원이어야 합니다" });
      return;
    }

    const now = new Date();
    const updates: Partial<typeof bagsTable.$inferInsert> & { updatedAt: Date } = {
      updatedAt: now,
    };
    if (price !== undefined) updates.price = price;
    if (quantity !== undefined) {
      // 이미 판매된 수량 보존: soldCount = 기존 수량 - 기존 잔여
      const soldCount = existing.quantity - existing.remainingQuantity;
      updates.quantity = quantity;
      updates.remainingQuantity = Math.max(0, quantity - soldCount);
    }
    if (closingTime) updates.closingTime = new Date(closingTime);
    if (status) {
      updates.status = status;
    } else if (closingTime) {
      // 마감 시간을 미래로 수정하면 자동으로 active 복구 (상품 재출시)
      // 단, 재고가 0이면 soldout 유지
      const newClosing = new Date(closingTime);
      const newRemaining = updates.remainingQuantity ?? existing.remainingQuantity;
      if (newClosing > now && newRemaining > 0) {
        updates.status = "active";
      }
    }
    if (category) updates.category = category;

    const [updated] = await db.update(bagsTable).set(updates).where(eq(bagsTable.id, bagId)).returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 판매자 주문 목록 ───
router.get("/seller/orders", requireSeller, async (req, res) => {
  try {
    const seller = req.seller!;

    // 마감 시간 지난 pending 주문 → completed(수령 완료) 자동 전환
    await expireStaleOrders().catch((err) => console.error("[expireStaleOrders]", err));

    const orders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.sellerId, seller.id))
      .orderBy(desc(ordersTable.createdAt));
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 판매자 픽업 확인 ───
router.post("/seller/pickup", requireSeller, async (req, res) => {
  try {
    const seller = req.seller!;
    const { qrToken, method } = req.body as { qrToken: string; method: "qr" | "button" };

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.qrToken, qrToken));

    if (!order) {
      res.status(404).json({ error: "Not Found", message: "주문을 찾을 수 없습니다" });
      return;
    }

    // 본인 매장 주문인지 검증 (IDOR 방지)
    if (order.sellerId !== seller.id) {
      res.status(403).json({ error: "Forbidden", message: "본인 매장의 주문만 픽업 처리할 수 있습니다" });
      return;
    }

    if (order.pickupStatus === "picked_up" || order.pickupStatus === "completed") {
      res.status(400).json({ error: "Already Picked Up", message: "이미 픽업 완료된 주문입니다" });
      return;
    }

    // 픽업 기록
    await db.insert(pickupsTable).values({ orderId: order.id, method });

    // 주문 상태 업데이트
    await db
      .update(ordersTable)
      .set({ pickupStatus: "picked_up", updatedAt: new Date() })
      .where(eq(ordersTable.id, order.id));

    res.json({ success: true, orderId: order.id, message: "픽업이 확인되었습니다" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

export default router;
