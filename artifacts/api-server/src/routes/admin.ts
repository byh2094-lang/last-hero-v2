import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  sellersTable,
  bagsTable,
  ordersTable,
  pickupsTable,
  blacklistTable,
  type Order,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql, desc, count, inArray, SQL } from "drizzle-orm";
import { signToken, requireAdmin } from "../lib/auth";
import { expireStaleOrders } from "../lib/expireOrders";
import { refundPayment } from "../lib/pg";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error("[admin] ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required but not set.");
}

const router: IRouter = Router();

// ─── 관리자 로그인 ───
router.post("/admin/login", (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = signToken({ id: 0, phone: "admin", role: "admin" });
    res.json({ token, role: "admin" });
  } else {
    res.status(401).json({ error: "Unauthorized", message: "아이디 또는 비밀번호가 올바르지 않습니다" });
  }
});

// ─── 판매자 목록 ───
router.get("/admin/sellers", requireAdmin, async (req, res) => {
  try {
    const { status } = req.query as { status?: string };

    const sellers = await db.select().from(sellersTable);

    const filtered = status
      ? sellers.filter((s) => s.approvalStatus === status)
      : sellers;

    // 픽업/노쇼 집계
    const withStats = await Promise.all(
      filtered.map(async (seller) => {
        const [pickupCount] = await db
          .select({ count: count() })
          .from(ordersTable)
          .where(and(eq(ordersTable.sellerId, seller.id), eq(ordersTable.pickupStatus, "picked_up")));

        const [noShowCount] = await db
          .select({ count: count() })
          .from(ordersTable)
          .where(and(eq(ordersTable.sellerId, seller.id), eq(ordersTable.pickupStatus, "no_show")));

        return {
          ...seller,
          totalPickups: pickupCount.count,
          totalNoShows: noShowCount.count,
        };
      })
    );

    res.json(withStats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 판매자 수동 등록 ───
router.post("/admin/sellers", requireAdmin, async (req, res) => {
  try {
    const { ownerName, storeName, phone, category, district, address, detailAddress, latitude, longitude, contactPhone } = req.body as {
      ownerName?: string; storeName: string; phone: string;
      category?: string; district?: string; address?: string; detailAddress?: string;
      latitude?: number; longitude?: number; contactPhone?: string;
    };
    if (!storeName || !phone) {
      res.status(400).json({ error: "Bad Request", message: "가게명과 휴대폰 번호는 필수입니다" });
      return;
    }

    const [existing] = await db.select().from(sellersTable).where(eq(sellersTable.phone, phone));
    if (existing) {
      res.status(409).json({ error: "Conflict", message: "이미 등록된 휴대폰 번호입니다" });
      return;
    }

    const [seller] = await db
      .insert(sellersTable)
      .values({
        ownerName: ownerName ?? "",
        storeName,
        phone,
        address: address ?? district ?? "",
        detailAddress: detailAddress ?? null,
        category: category ?? "",
        district: district ?? "",
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        contactPhone: contactPhone ?? null,
        approvalStatus: "approved",
      })
      .returning();

    res.status(201).json(seller);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 판매자 설정 업데이트 (최대 판매가 / 주소 / 카테고리 / 좌표 등) ───
router.put("/admin/sellers/:id", requireAdmin, async (req, res) => {
  try {
    const sellerId = parseInt(req.params.id as string, 10);
    const { maxPrice, address, detailAddress, category, latitude, longitude, contactPhone, ownerName, storeName } = req.body as {
      maxPrice?: number;
      address?: string;
      detailAddress?: string;
      category?: string;
      latitude?: number;
      longitude?: number;
      contactPhone?: string;
      ownerName?: string;
      storeName?: string;
    };

    if (maxPrice !== undefined && (maxPrice < 0 || maxPrice > 1000000)) {
      res.status(400).json({ error: "Bad Request", message: "최대 판매가는 0~1,000,000원 사이여야 합니다" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (maxPrice !== undefined) updates.maxPrice = maxPrice;
    if (address !== undefined) updates.address = address;
    if (detailAddress !== undefined) updates.detailAddress = detailAddress;
    if (category !== undefined) updates.category = category;
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (contactPhone !== undefined) updates.contactPhone = contactPhone;
    if (ownerName !== undefined) updates.ownerName = ownerName;
    if (storeName !== undefined) updates.storeName = storeName;

    const [updated] = await db
      .update(sellersTable)
      .set(updates)
      .where(eq(sellersTable.id, sellerId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Not Found", message: "판매자를 찾을 수 없습니다" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 판매자 상태 변경 (5단계: pending / approved / rejected / suspended / cancelled) ───
router.put("/admin/sellers/:id/approve", requireAdmin, async (req, res) => {
  try {
    const sellerId = parseInt(req.params.id as string, 10);
    const { status, reason } = req.body as {
      status: "pending" | "approved" | "rejected" | "suspended" | "cancelled";
      reason?: string;
    };

    const needsReason = status === "suspended" || status === "cancelled";

    const [updated] = await db
      .update(sellersTable)
      .set({
        approvalStatus: status,
        suspendReason: needsReason ? (reason ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(sellersTable.id, sellerId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Not Found", message: "판매자를 찾을 수 없습니다" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 전체 주문 로그 ───
router.get("/admin/orders", requireAdmin, async (req, res) => {
  try {
    // 마감 시간 지난 pending 주문 → completed(수령 완료) 자동 전환
    await expireStaleOrders().catch((err) => console.error("[expireStaleOrders]", err));

    const { status, from, to, page, pageSize } = req.query as {
      status?: string; from?: string; to?: string; page?: string; pageSize?: string;
    };

    const PAGE_SIZE = Math.min(parseInt(pageSize ?? "20", 10), 100);
    const PAGE = Math.max(parseInt(page ?? "1", 10), 1);
    const offset = (PAGE - 1) * PAGE_SIZE;

    const conditions: SQL[] = [];
    if (status) {
      conditions.push(eq(ordersTable.pickupStatus, status as Order["pickupStatus"]));
    }
    if (from) conditions.push(gte(ordersTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(ordersTable.createdAt, new Date(to)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 전체 건수 조회
    const [{ total }] = await db
      .select({ total: count() })
      .from(ordersTable)
      .where(whereClause);

    // 페이지 데이터 조회
    const orders = await db
      .select({
        id: ordersTable.id,
        bagId: ordersTable.bagId,
        sellerId: ordersTable.sellerId,
        sellerName: sellersTable.storeName,
        customerToken: ordersTable.customerToken,
        customerPhone: ordersTable.customerPhone,
        amount: ordersTable.amount,
        pickupStatus: ordersTable.pickupStatus,
        qrToken: ordersTable.qrToken,
        bagType: bagsTable.type,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .leftJoin(sellersTable, eq(ordersTable.sellerId, sellersTable.id))
      .leftJoin(bagsTable, eq(ordersTable.bagId, bagsTable.id))
      .where(whereClause)
      .orderBy(desc(ordersTable.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset);

    res.json({ orders, total: Number(total), page: PAGE, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 어드민 강제 취소 + PG 환불 (allowUserCancel 설정과 무관하게 항상 가능) ───
router.post("/admin/orders/:id/cancel", requireAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id as string, 10);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));

    if (!order) {
      res.status(404).json({ error: "Not Found", message: "주문을 찾을 수 없습니다" });
      return;
    }
    if (order.pickupStatus === "cancelled") {
      res.status(409).json({ error: "Conflict", message: "이미 취소된 주문입니다" });
      return;
    }
    if (order.pickupStatus === "picked_up" || order.pickupStatus === "completed") {
      res.status(409).json({ error: "Conflict", message: "픽업 완료된 주문은 취소할 수 없습니다" });
      return;
    }

    // PG 환불
    const pgKey = order.pgReceiptId ?? `mock_${order.qrToken}`;
    const refund = await refundPayment({
      paymentKey: pgKey,
      cancelReason: "어드민 강제 취소",
      cancelAmount: order.amount > 0 ? order.amount : undefined,
    });
    if (!refund.success) {
      res.status(502).json({ error: "RefundFailed", message: refund.error ?? "환불 처리 실패" });
      return;
    }

    // 트랜잭션: 취소 + 재고 복구
    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.id, order.bagId));
    await db.transaction(async (tx) => {
      await tx
        .update(ordersTable)
        .set({ pickupStatus: "cancelled", updatedAt: new Date() })
        .where(eq(ordersTable.id, orderId));

      if (bag) {
        await tx
          .update(bagsTable)
          .set({
            remainingQuantity: sql`${bagsTable.remainingQuantity} + 1`,
            status: bag.status === "soldout" ? "active" : bag.status,
            updatedAt: new Date(),
          })
          .where(eq(bagsTable.id, bag.id));
      }
    });

    res.json({ success: true, message: "어드민 강제 취소 및 환불이 완료되었습니다" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 블랙리스트 조회 ───
router.get("/admin/blacklist", requireAdmin, async (req, res) => {
  try {
    const entries = await db.select().from(blacklistTable).orderBy(desc(blacklistTable.createdAt));
    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 블랙리스트 추가 ───
router.post("/admin/blacklist", requireAdmin, async (req, res) => {
  try {
    const { phone, reason } = req.body as { phone: string; reason?: string };
    // 전화번호 정규화 — orders.ts 블랙리스트 조회와 동일 규칙 적용
    const normalizedPhone = phone.replace(/\D/g, "");

    const [existing] = await db.select().from(blacklistTable).where(eq(blacklistTable.phone, normalizedPhone));

    if (existing) {
      const [updated] = await db
        .update(blacklistTable)
        .set({ isBlocked: true, reason, updatedAt: new Date() })
        .where(eq(blacklistTable.id, existing.id))
        .returning();
      res.status(201).json(updated);
      return;
    }

    const [entry] = await db
      .insert(blacklistTable)
      .values({ phone: normalizedPhone, isBlocked: true, reason })
      .returning();

    res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 블랙리스트 차단/해제 ───
router.put("/admin/blacklist/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { isBlocked } = req.body as { isBlocked: boolean };

    const [updated] = await db
      .update(blacklistTable)
      .set({ isBlocked, updatedAt: new Date() })
      .where(eq(blacklistTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Not Found", message: "블랙리스트 항목을 찾을 수 없습니다" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── ESG/히어로 통계 ───
router.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    const { month } = req.query as { month?: string };

    let fromDate: Date;
    let toDate: Date;

    if (month) {
      const [year, m] = month.split("-").map(Number);
      fromDate = new Date(year, m - 1, 1);
      toDate = new Date(year, m, 0, 23, 59, 59);
    } else {
      const now = new Date();
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    // 히어로 랭킹
    const heroRanking = await db
      .select({
        customerPhone: ordersTable.customerPhone,
        customerName: ordersTable.customerName,
        totalOrders: count(ordersTable.id),
      })
      .from(ordersTable)
      .where(and(gte(ordersTable.createdAt, fromDate), lte(ordersTable.createdAt, toDate)))
      .groupBy(ordersTable.customerPhone, ordersTable.customerName)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    const ranking = heroRanking.map((h, i) => ({
      rank: i + 1,
      customerPhone: h.customerPhone,
      customerName: h.customerName || "익명 히어로",
      totalOrders: Number(h.totalOrders),
      esgScore: Number(h.totalOrders) * 0.5,
      donationAmount: Number(h.totalOrders) * 500,
    }));

    // 무료/유료 백 집계
    const [freeBagsResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .leftJoin(bagsTable, eq(ordersTable.bagId, bagsTable.id))
      .where(and(eq(bagsTable.type, "free"), gte(ordersTable.createdAt, fromDate), lte(ordersTable.createdAt, toDate)));

    const [paidBagsResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .leftJoin(bagsTable, eq(ordersTable.bagId, bagsTable.id))
      .where(and(eq(bagsTable.type, "paid"), gte(ordersTable.createdAt, fromDate), lte(ordersTable.createdAt, toDate)));

    // 총 주문 수
    const [totalOrdersResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(and(gte(ordersTable.createdAt, fromDate), lte(ordersTable.createdAt, toDate)));

    const totalOrders = Number(totalOrdersResult.count);
    const totalFreeBags = Number(freeBagsResult.count);
    const totalPaidBags = Number(paidBagsResult.count);

    // 일별 주문 추이
    const monthlyOrders = await db
      .select({
        date: sql<string>`DATE(${ordersTable.createdAt})::text`,
        count: count(),
      })
      .from(ordersTable)
      .where(and(gte(ordersTable.createdAt, fromDate), lte(ordersTable.createdAt, toDate)))
      .groupBy(sql`DATE(${ordersTable.createdAt})`);

    res.json({
      heroRanking: ranking,
      totalFreeBags,
      totalPaidBags,
      totalFoodSavedKg: totalOrders * 0.5,
      totalTreesSaved: totalOrders * 0.5,
      totalDonationAmount: totalPaidBags * 500,
      monthlyOrders: monthlyOrders.map((m) => ({ date: m.date, count: Number(m.count) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

interface SettlementEntry {
  sellerId: number;
  sellerName: string | null;
  bankAccount: string | null;
  totalSales: number;
  orderCount: number;
}

// ─── 정산 내역 ───
router.get("/admin/settlement", requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query as { from: string; to: string };

    const orders = await db
      .select({
        sellerId: ordersTable.sellerId,
        sellerName: sellersTable.storeName,
        bankAccount: sellersTable.bankAccount,
        amount: ordersTable.amount,
      })
      .from(ordersTable)
      .leftJoin(sellersTable, eq(ordersTable.sellerId, sellersTable.id))
      .where(
        and(
          gte(ordersTable.createdAt, new Date(from)),
          lte(ordersTable.createdAt, new Date(to)),
          inArray(ordersTable.pickupStatus, ["picked_up", "completed"])
        )
      );

    // 판매자별 집계
    const settlementMap = new Map<number, SettlementEntry>();
    for (const order of orders) {
      if (!settlementMap.has(order.sellerId)) {
        settlementMap.set(order.sellerId, {
          sellerId: order.sellerId,
          sellerName: order.sellerName,
          bankAccount: order.bankAccount,
          totalSales: 0,
          orderCount: 0,
        });
      }
      const entry = settlementMap.get(order.sellerId)!;
      entry.totalSales += order.amount;
      entry.orderCount += 1;
    }

    const settlement = Array.from(settlementMap.values()).map((s) => {
      const platformFee = Math.round(s.totalSales * 0.12);
      const pgFee = Math.round(s.totalSales * 0.03);
      return {
        ...s,
        platformFee,
        pgFee,
        netAmount: s.totalSales - platformFee - pgFee,
      };
    });

    res.json(settlement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 정산 엑셀 다운로드 ───
router.get("/admin/settlement/export", requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query as { from: string; to: string };

    const orders = await db
      .select({
        sellerId: ordersTable.sellerId,
        sellerName: sellersTable.storeName,
        bankAccount: sellersTable.bankAccount,
        amount: ordersTable.amount,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .leftJoin(sellersTable, eq(ordersTable.sellerId, sellersTable.id))
      .where(
        and(
          gte(ordersTable.createdAt, new Date(from)),
          lte(ordersTable.createdAt, new Date(to)),
          inArray(ordersTable.pickupStatus, ["picked_up", "completed"])
        )
      );

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("정산내역");

    sheet.columns = [
      { header: "판매자 ID", key: "sellerId", width: 12 },
      { header: "매장명", key: "sellerName", width: 20 },
      { header: "계좌", key: "bankAccount", width: 30 },
      { header: "판매총액", key: "totalSales", width: 15 },
      { header: "플랫폼수수료(12%)", key: "platformFee", width: 20 },
      { header: "PG수수료(3%)", key: "pgFee", width: 15 },
      { header: "입금예정액", key: "netAmount", width: 15 },
      { header: "주문건수", key: "orderCount", width: 12 },
    ];

    const settlementMap = new Map<number, SettlementEntry>();
    for (const order of orders) {
      if (!settlementMap.has(order.sellerId)) {
        settlementMap.set(order.sellerId, {
          sellerId: order.sellerId,
          sellerName: order.sellerName,
          bankAccount: order.bankAccount,
          totalSales: 0,
          orderCount: 0,
        });
      }
      const entry = settlementMap.get(order.sellerId)!;
      entry.totalSales += order.amount;
      entry.orderCount += 1;
    }

    for (const s of Array.from(settlementMap.values())) {
      const platformFee = Math.round(s.totalSales * 0.12);
      const pgFee = Math.round(s.totalSales * 0.03);
      sheet.addRow({
        ...s,
        platformFee,
        pgFee,
        netAmount: s.totalSales - platformFee - pgFee,
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="settlement-${from}-to-${to}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

// ─── 장소 검색 프록시 (카카오 우선 → Nominatim 폴백) ───
router.get("/admin/place-search", requireAdmin, async (req, res) => {
  const query = (req.query.q as string | undefined)?.trim();
  if (!query || query.length < 2) {
    res.status(400).json({ error: "Bad Request", message: "검색어가 너무 짧습니다" });
    return;
  }

  const kakaoKey = process.env.KAKAO_REST_API_KEY;

  // ── 카카오 로컬 API ──────────────────────────────────────────────
  if (kakaoKey) {
    try {
      const kakaoUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=10`;
      const kakaoRes = await fetch(kakaoUrl, {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
      });
      if (kakaoRes.ok) {
        const kakaoData = await kakaoRes.json() as {
          documents: Array<{
            place_name: string;
            road_address_name: string;
            address_name: string;
            x: string; // longitude
            y: string; // latitude
            phone?: string;
            category_name?: string;
          }>;
        };
        const results = kakaoData.documents.map((d) => ({
          display_name: d.place_name,
          road: d.road_address_name || d.address_name,
          lat: d.y,
          lon: d.x,
          phone: d.phone || null,
          category: d.category_name || null,
          source: "kakao" as const,
        }));
        res.json({ results, source: "kakao" });
        return;
      }
    } catch (err) {
      console.warn("[place-search] 카카오 API 실패, Nominatim으로 폴백:", err);
    }
  }

  // ── Nominatim 폴백 ──────────────────────────────────────────────
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&countrycodes=kr&accept-language=ko&addressdetails=1`;
    const nomRes = await fetch(nomUrl, {
      headers: { "User-Agent": "LastHeroAdminApp/1.0" },
    });
    const nomData = await nomRes.json() as Array<Record<string, unknown>>;
    const results = nomData.map((d) => {
      const addr = d.address as Record<string, string> | undefined;
      const road = [addr?.road, addr?.quarter, addr?.suburb, addr?.city || addr?.town || addr?.county, addr?.province]
        .filter(Boolean).join(", ");
      return {
        display_name: (d.display_name as string).split(",")[0],
        road: road || (d.display_name as string),
        lat: d.lat as string,
        lon: d.lon as string,
        phone: null,
        category: null,
        source: "nominatim" as const,
      };
    });
    res.json({ results, source: "nominatim" });
  } catch (err) {
    console.error("[place-search] Nominatim 실패:", err);
    res.status(502).json({ error: "Search Failed", message: "장소 검색 서비스에 일시적 문제가 있습니다" });
  }
});

export default router;
