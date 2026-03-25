import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bagsTable, sellersTable } from "@workspace/db/schema";
import { eq, and, gte, gt, or, like, SQL, desc } from "drizzle-orm";

const router: IRouter = Router();

// Haversine 거리 계산 (km)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get("/bags", async (req, res) => {
  try {
    const { type, lat, lng, radius, district } = req.query as {
      type?: string;
      lat?: string;
      lng?: string;
      radius?: string;
      district?: string;
    };

    const now = new Date();

    // 손님 화면: 판매 중(active) + 재고 있음 + 마감 시간 이전 + 승인된 판매자만 반환
    const conditions: SQL[] = [
      eq(sellersTable.approvalStatus, "approved"),
      eq(bagsTable.status, "active"),
      gt(bagsTable.remainingQuantity, 0),
      gte(bagsTable.closingTime, now),
    ];

    if (type === "free") conditions.push(eq(bagsTable.type, "free"));
    else if (type === "paid") conditions.push(eq(bagsTable.type, "paid"));

    // ─── [수동 모드] district 선택/검색 ──────────────────────────────────────
    // district 컬럼 정확 일치 OR 주소(address)에 지역명 포함 → 거리 필터 완전 무시
    const isDistrictMode = !!district;
    if (isDistrictMode) {
      conditions.push(
        or(
          eq(sellersTable.district, district!),
          like(sellersTable.address, `%${district}%`)
        ) as SQL
      );
    }

    const bags = await db
      .select({
        id: bagsTable.id,
        sellerId: bagsTable.sellerId,
        sellerName: sellersTable.storeName,
        sellerAddress: sellersTable.address,
        sellerDetailAddress: sellersTable.detailAddress,
        sellerLat: sellersTable.latitude,
        sellerLng: sellersTable.longitude,
        sellerDistrict: sellersTable.district,
        type: bagsTable.type,
        originalPrice: bagsTable.originalPrice,
        price: bagsTable.price,
        quantity: bagsTable.quantity,
        remainingQuantity: bagsTable.remainingQuantity,
        closingTime: bagsTable.closingTime,
        status: bagsTable.status,
        category: bagsTable.category,
        description: bagsTable.description,
        imageUrl: bagsTable.imageUrl,
        createdAt: bagsTable.createdAt,
      })
      .from(bagsTable)
      .innerJoin(sellersTable, eq(bagsTable.sellerId, sellersTable.id))
      .where(and(...conditions))
      .orderBy(desc(bagsTable.createdAt))
      .limit(200);

    // ─── [자동 GPS 모드] district 없을 때만 2km 반경 필터 적용 ────────────────
    const userLat = !isDistrictMode && lat ? parseFloat(lat) : null;
    const userLng = !isDistrictMode && lng ? parseFloat(lng) : null;
    const maxRadius = radius ? parseFloat(radius) : 2;

    const withDistance = bags.map((bag) => {
      let distance: number | null = null;
      if (userLat !== null && userLng !== null && bag.sellerLat && bag.sellerLng) {
        distance = haversineKm(userLat, userLng, bag.sellerLat, bag.sellerLng);
      }
      return { ...bag, distance };
    });

    let result = withDistance;

    if (!isDistrictMode && userLat !== null && userLng !== null) {
      // GPS 모드: 좌표 없는 업체 제외 + 반경 내 필터 + 거리 가까운 순 정렬
      result = withDistance
        .filter((b) => b.distance !== null && b.distance <= maxRadius)
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }
    // district 모드: 거리 계산 없이 DB 순서 그대로 반환

    // 최신순 20개 제한 (전국 데이터 과부하 방지)
    const limited = result.slice(0, 20);

    res.json(limited);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "서버 오류가 발생했습니다" });
  }
});

export default router;
