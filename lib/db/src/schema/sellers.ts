import { pgTable, text, serial, timestamp, pgEnum, doublePrecision, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "suspended", "cancelled"]);

export const sellersTable = pgTable("sellers", {
  id: serial("id").primaryKey(),
  ownerName: text("owner_name"),
  storeName: text("store_name").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull().unique(),
  bankAccount: text("bank_account"),
  approvalStatus: approvalStatusEnum("approval_status").notNull().default("pending"),
  category: text("category"),
  // 위치 정보 (위치 기반 필터링 및 거리 계산용)
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  district: text("district"), // 법정동 (예: 봉담읍, 행궁동)
  maxPrice: integer("max_price").notNull().default(10000), // 이 판매자의 최대 등록 가격 (관리자 설정)
  showContact: boolean("show_contact").notNull().default(true), // 구매자에게 연락처 공개 여부
  contactPhone: text("contact_phone"), // 고객 응대용 매장 번호 (null이면 가입 번호 표시)
  detailAddress: text("detail_address"), // 상세 주소 (예: OO시장 B동 102호)
  suspendReason: text("suspend_reason"), // 이용중지/취소 사유 (관리자 메모)
  password: text("password").notNull().default("0000"), // 로그인 비밀번호 (초기값: 0000)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSellerSchema = createInsertSchema(sellersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSeller = z.infer<typeof insertSellerSchema>;
export type Seller = typeof sellersTable.$inferSelect;
