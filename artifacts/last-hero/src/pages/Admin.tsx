import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  useAdminLogin,
  useAdminListSellers,
  useAdminListBlacklist,
  useAdminAddBlacklist,
  useAdminUpdateBlacklist,
  useAdminGetStats,
  useAdminGetSettlement,
  adminExportSettlement,
  getAdminGetStatsQueryKey,
  getAdminListSellersQueryKey,
  getAdminListBlacklistQueryKey,
  getAdminGetSettlementQueryKey,
  type Claim,
} from '@workspace/api-client-react';
import { NeoButton, NeoInput, NeoLabel, NeoBadge, cn } from '@/components/NeoUI';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, Users, ListOrdered, UserX, BarChart3, DollarSign,
  Download, AlertTriangle, CheckCircle, XCircle, Clock, Leaf, TreePine, Heart, MessageSquareWarning, UserPlus, Megaphone, Trash2, Settings, ToggleLeft, ToggleRight, Ban, Tag, MapPin, Plus
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import { format, startOfWeek, endOfWeek } from 'date-fns';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function AdminAuth({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { toast } = useToast();
  const { mutate: login, isPending } = useAdminLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ data: { username, password } }, {
      onSuccess: (data) => onLogin(data.token),
      onError: (err) => toast({ title: '로그인 실패', description: err.message, variant: 'destructive' })
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-zen-bg">
      <div className="w-full max-w-sm bg-white border border-zen-border rounded-2xl p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-full bg-zen-green-bg flex items-center justify-center">
            <Shield className="w-7 h-7 text-zen-green" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-zen-text text-center mb-1">관리자 로그인</h1>
        <p className="text-sm text-zen-sub text-center mb-6">라스트 히어로 어드민 콘솔</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <NeoLabel className="mb-1.5 block text-sm">아이디</NeoLabel>
            <NeoInput value={username} onChange={e => setUsername(e.target.value)} required placeholder="admin" />
          </div>
          <div>
            <NeoLabel className="mb-1.5 block text-sm">비밀번호</NeoLabel>
            <NeoInput type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <NeoButton type="submit" variant="primary" className="w-full mt-2" disabled={isPending}>
            {isPending ? '로그인 중...' : '접속하기'}
          </NeoButton>
        </form>
        <p className="text-xs text-zen-muted text-center mt-4">admin / lasthero2026</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit = '', icon: Icon, green = false }: {
  label: string; value: string | number; unit?: string; icon: React.ElementType; green?: boolean
}) {
  return (
    <div className={cn(
      "bg-white border border-zen-border rounded-xl p-5 shadow-sm",
      green && "bg-zen-green-bg border-[#BDD8C6]"
    )}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-medium text-zen-sub">{label}</span>
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", green ? "bg-white/50" : "bg-zen-warm")}>
          <Icon className={cn("w-4 h-4", green ? "text-zen-green" : "text-zen-sub")} />
        </div>
      </div>
      <div className={cn("text-3xl font-bold", green ? "text-zen-green" : "text-zen-text")}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="text-sm font-normal ml-1 text-zen-sub">{unit}</span>}
      </div>
    </div>
  );
}

function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useState<'stats' | 'sellers' | 'orders' | 'blacklist' | 'settlement' | 'claims' | 'register' | 'notices' | 'categories' | 'settings'>('stats');
  const authHeader = { Authorization: `Bearer ${token}` };
  const { toast } = useToast();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);

  // ── 공지사항 상태 ──
  interface Notice { id: number; title: string; content: string; target: 'all' | 'customer' | 'seller'; isPinned: string; createdAt: string; }
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeTarget, setNoticeTarget] = useState<'all' | 'customer' | 'seller'>('all');
  const [noticePinned, setNoticePinned] = useState(false);
  const [noticePosting, setNoticePosting] = useState(false);

  // ── 시스템 설정 상태 ──
  const [allowUserCancel, setAllowUserCancel] = useState<boolean | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      const json = await res.json();
      setAllowUserCancel(json.allowUserCancel ?? true);
    } catch { /* 기본값 유지 */ }
  }, []);

  const toggleCancelSetting = async (next: boolean) => {
    setSettingsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ allowUserCancel: next }),
      });
      if (!res.ok) throw new Error();
      setAllowUserCancel(next);
      toast({ title: next ? '✅ 유저 취소 허용 ON' : '🔒 유저 취소 차단 ON', description: next ? '마감 15분 전까지 유저가 직접 취소할 수 있습니다.' : '모든 유저 화면에서 취소 버튼이 숨겨집니다.' });
    } catch {
      toast({ title: '설정 변경 실패', variant: 'destructive' });
    } finally {
      setSettingsLoading(false);
    }
  };

  // ── 어드민 강제취소 ──
  const [forceCancelling, setForceCancelling] = useState<number | null>(null);
  const handleForceCancel = async (orderId: number) => {
    if (!window.confirm(`주문 #${orderId}을 강제 취소하고 PG 환불 처리할까요?`)) return;
    setForceCancelling(orderId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: '강제취소 실패', description: data.message ?? '오류', variant: 'destructive' });
        return;
      }
      toast({ title: '✅ 강제취소 완료', description: '환불이 처리되었습니다.' });
    } catch {
      toast({ title: '네트워크 오류', variant: 'destructive' });
    } finally {
      setForceCancelling(null);
    }
  };

  const fetchNotices = useCallback(async () => {
    setNoticesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/notices`, { headers: authHeader });
      const json = await res.json();
      setNotices(Array.isArray(json) ? json : []);
    } catch {
      toast({ title: '공지 조회 실패', variant: 'destructive' });
    } finally {
      setNoticesLoading(false);
    }
  }, [token]);

  // 카테고리 관리 상태 — fetchCategories가 아래 useEffect보다 먼저 선언되어야 함
  const [categories, setCategories] = useState<{ id: number; name: string; emoji: string }[]>([]);
  const [catName, setCatName] = useState('');
  const [catEmoji, setCatEmoji] = useState('🎁');
  const [catPending, setCatPending] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/categories`);
      const d = await r.json();
      if (Array.isArray(d)) setCategories(d);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (tab === 'notices') fetchNotices();
    if (tab === 'settings') fetchSettings();
    if (tab === 'categories') fetchCategories();
    if (tab === 'register') fetchCategories();
  }, [tab, fetchNotices, fetchSettings, fetchCategories]);

  const handleNoticePost = async () => {
    if (!noticeTitle.trim() || !noticeContent.trim()) {
      toast({ title: '제목과 내용을 입력해주세요', variant: 'destructive' });
      return;
    }
    setNoticePosting(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/notices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ title: noticeTitle, content: noticeContent, target: noticeTarget, isPinned: noticePinned }),
      });
      if (!res.ok) throw new Error();
      toast({ title: '✅ 공지 발행 완료' });
      setNoticeTitle(''); setNoticeContent(''); setNoticeTarget('all'); setNoticePinned(false);
      fetchNotices();
    } catch {
      toast({ title: '공지 발행 실패', variant: 'destructive' });
    } finally {
      setNoticePosting(false);
    }
  };

  const handleNoticeDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/notices/${id}`, { method: 'DELETE', headers: authHeader });
      if (!res.ok) throw new Error();
      toast({ title: '공지 삭제 완료' });
      setNotices(prev => prev.filter(n => n.id !== id));
    } catch {
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  };

  const fetchClaims = useCallback(async () => {
    setClaimsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/claims`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setClaims(json.claims ?? []);
    } catch {
      toast({ title: '클레임 조회 실패', variant: 'destructive' });
    } finally {
      setClaimsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === 'claims') fetchClaims();
  }, [tab, fetchClaims]);

  const handleClaimStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/claims/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast({ title: status === 'resolved' ? '✅ 처리 완료' : '🔄 처리 중으로 변경' });
      fetchClaims();
    } catch {
      toast({ title: '상태 변경 실패', variant: 'destructive' });
    }
  };

  // Settlement date range (this week by default)
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const [settlFrom, setSettlFrom] = useState(format(weekStart, 'yyyy-MM-dd'));
  const [settlTo, setSettlTo] = useState(format(weekEnd, 'yyyy-MM-dd'));

  // Blacklist manual add form
  const [blPhone, setBlPhone] = useState('');
  const [blReason, setBlReason] = useState('');

  // 판매자 수동 등록 폼
  const [regOwner, setRegOwner] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regStore, setRegStore] = useState('');
  const [regCategory, setRegCategory] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regDetailAddress, setRegDetailAddress] = useState('');
  const [regLat, setRegLat] = useState<number | null>(null);
  const [regLng, setRegLng] = useState<number | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [regPending, setRegPending] = useState(false);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 가게 이름 자동 검색 (카카오 로컬 API 우선 → Nominatim 폴백, 백엔드 프록시)
  interface PlaceResult {
    display_name: string; road: string;
    lat: string; lon: string;
    phone: string | null; category: string | null;
    source: 'kakao' | 'nominatim';
  }
  const [storeSearchResults, setStoreSearchResults] = useState<PlaceResult[]>([]);
  const [showSearchDrop, setShowSearchDrop] = useState(false);
  const [storeSearchLoading, setStoreSearchLoading] = useState(false);
  const [searchSource, setSearchSource] = useState<'kakao' | 'nominatim' | null>(null);
  const storeSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchStoreByName = useCallback(async (name: string) => {
    if (name.trim().length < 2) { setStoreSearchResults([]); setShowSearchDrop(false); return; }
    setStoreSearchLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/place-search?q=${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('search failed');
      const data = await r.json() as { results: PlaceResult[]; source: 'kakao' | 'nominatim' };
      setStoreSearchResults(data.results);
      setSearchSource(data.source);
      setShowSearchDrop(data.results.length > 0);
    } catch {
      setStoreSearchResults([]);
      setShowSearchDrop(false);
    } finally {
      setStoreSearchLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (storeSearchTimer.current) clearTimeout(storeSearchTimer.current);
    storeSearchTimer.current = setTimeout(() => searchStoreByName(regStore), 500);
    return () => { if (storeSearchTimer.current) clearTimeout(storeSearchTimer.current); };
  }, [regStore, searchStoreByName]);

  const handleSelectPlace = (p: PlaceResult) => {
    setRegAddress(p.road);
    setRegLat(parseFloat(p.lat));
    setRegLng(parseFloat(p.lon));
    setShowSearchDrop(false);
    toast({ title: '📍 위치 선택 완료', description: `좌표가 자동 입력됐습니다.` });
  };

  // 주소 → 좌표 변환 공통 함수 (Nominatim)
  const geocodeAddress = useCallback(async (address: string, silent = false) => {
    if (!address.trim()) return;
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=kr&accept-language=ko`;
      const r = await fetch(url, { headers: { 'User-Agent': 'LastHeroAdminApp/1.0' } });
      const data = await r.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setRegLat(lat);
        setRegLng(lng);
        if (!silent) toast({ title: '✅ 좌표 변환 완료', description: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
      } else if (!silent) {
        toast({ title: '주소를 찾을 수 없습니다', description: '더 구체적인 주소를 입력해보세요.', variant: 'destructive' });
      }
    } catch {
      if (!silent) toast({ title: '좌표 변환 실패', variant: 'destructive' });
    } finally {
      setGeocoding(false);
    }
  }, [toast]);

  const handleGeocode = () => {
    geocodeAddress(regAddress, false);
  };

  const handleAddCategory = async () => {
    if (!catName.trim()) return;
    setCatPending(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ name: catName.trim(), emoji: catEmoji }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: d.message ?? '추가 실패', variant: 'destructive' }); return; }
      setCatName(''); setCatEmoji('🎁');
      fetchCategories();
      toast({ title: `✅ '${d.name}' 카테고리 추가 완료` });
    } catch {
      toast({ title: '추가 실패', variant: 'destructive' });
    } finally {
      setCatPending(false);
    }
  };

  const handleDeleteCategory = async (id: number, name: string) => {
    if (!window.confirm(`'${name}' 카테고리를 삭제할까요?`)) return;
    try {
      const r = await fetch(`${API_BASE}/api/admin/categories/${id}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      if (!r.ok) { toast({ title: '삭제 실패', variant: 'destructive' }); return; }
      fetchCategories();
      toast({ title: `'${name}' 삭제 완료` });
    } catch {
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  };

  const { data: stats } = useAdminGetStats({}, {
    request: { headers: authHeader },
    query: { queryKey: getAdminGetStatsQueryKey(), enabled: tab === 'stats' }
  });

  const { data: sellers, refetch: refetchSellers } = useAdminListSellers({}, {
    request: { headers: authHeader },
    query: { queryKey: getAdminListSellersQueryKey(), enabled: tab === 'sellers' || tab === 'register' }
  });

  // ── 픽업 로그 페이지네이션 ──
  const [ordersPage, setOrdersPage] = useState(1);
  const ORDERS_PAGE_SIZE = 20;
  const [ordersData, setOrdersData] = useState<{
    orders: {
      id: number; bagId: number; sellerId: number; sellerName: string | null;
      customerToken: string; customerPhone: string | null; amount: number;
      pickupStatus: string; qrToken: string; bagType: string | null; createdAt: string;
    }[];
    total: number; page: number; pageSize: number;
  } | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const fetchOrders = useCallback(async (page: number) => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/orders?page=${page}&pageSize=${ORDERS_PAGE_SIZE}`, {
        headers: authHeader,
      });
      const json = await res.json();
      setOrdersData(json);
    } catch {
      toast({ title: '주문 조회 실패', variant: 'destructive' });
    } finally {
      setOrdersLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (tab === 'orders') fetchOrders(ordersPage);
  }, [tab, ordersPage, fetchOrders]);

  const orders = ordersData?.orders;

  const { data: blacklist, refetch: refetchBlacklist } = useAdminListBlacklist({
    request: { headers: authHeader },
    query: { queryKey: getAdminListBlacklistQueryKey(), enabled: tab === 'blacklist' }
  });

  const settlParams = { from: settlFrom, to: settlTo };
  const { data: settlement, refetch: refetchSettlement } = useAdminGetSettlement(settlParams, {
    request: { headers: authHeader },
    query: { queryKey: getAdminGetSettlementQueryKey(settlParams), enabled: tab === 'settlement' }
  });

  const { mutate: addBlacklist, isPending: addBlPending } = useAdminAddBlacklist({ request: { headers: authHeader } });
  const { mutate: updateBlacklist } = useAdminUpdateBlacklist({ request: { headers: authHeader } });
  const [exporting, setExporting] = useState(false);

  // 판매자별 최대 판매가 설정 상태
  const [maxPriceInputs, setMaxPriceInputs] = useState<Record<number, string>>({});
  const [maxPriceSaving, setMaxPriceSaving] = useState<Record<number, boolean>>({});

  // 판매자 상태 관리
  const [sellerStatusFilter, setSellerStatusFilter] = useState<'all' | 'pending' | 'approved' | 'suspended' | 'cancelled'>('all');
  const [statusModal, setStatusModal] = useState<{ id: number; storeName: string; targetStatus: string } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const handleStatusChange = async (id: number, status: string, reason?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/sellers/${id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, reason }),
      });
      if (!res.ok) throw new Error();
      const labels: Record<string, string> = {
        approved: '✅ 승인 완료',
        pending: '⏳ 대기 상태 전환',
        rejected: '거절 처리',
        suspended: '⚠️ 이용 중지 처리',
        cancelled: '⛔ 승인 취소 처리',
      };
      toast({ title: labels[status] ?? '상태 변경 완료' });
      refetchSellers();
    } catch {
      toast({ title: '상태 변경 실패', variant: 'destructive' });
    }
  };

  const openStatusModal = (id: number, storeName: string, targetStatus: string) => {
    setReasonInput('');
    setStatusModal({ id, storeName, targetStatus });
  };

  const confirmStatusModal = () => {
    if (!statusModal) return;
    handleStatusChange(statusModal.id, statusModal.targetStatus, reasonInput || undefined);
    setStatusModal(null);
  };

  const handleSaveMaxPrice = async (sellerId: number) => {
    const value = Number(maxPriceInputs[sellerId]);
    if (!value || value <= 0) { toast({ title: '유효한 금액을 입력해주세요', variant: 'destructive' }); return; }
    setMaxPriceSaving(prev => ({ ...prev, [sellerId]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/admin/sellers/${sellerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ maxPrice: value }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `✅ 최대 판매가 설정 완료`, description: `${value.toLocaleString()}원으로 변경됐습니다` });
      refetchSellers();
    } catch {
      toast({ title: '저장 실패', variant: 'destructive' });
    } finally {
      setMaxPriceSaving(prev => ({ ...prev, [sellerId]: false }));
    }
  };

  const handleToggleBlacklist = (id: number, current: boolean) => {
    updateBlacklist({ id, data: { isBlocked: !current } }, {
      onSuccess: () => { toast({ title: current ? '차단 해제 완료' : '⛔ 차단 처리 완료' }); refetchBlacklist(); },
      onError: (err) => toast({ title: '오류', description: err.message, variant: 'destructive' })
    });
  };

  const handleAddBlacklist = (e: React.FormEvent) => {
    e.preventDefault();
    addBlacklist({ data: { phone: blPhone, reason: blReason || undefined } }, {
      onSuccess: () => {
        toast({ title: '⛔ 블랙리스트 등록 완료', description: blPhone });
        setBlPhone(''); setBlReason('');
        refetchBlacklist();
      },
      onError: (err) => toast({ title: '오류', description: err.message, variant: 'destructive' })
    });
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const blob = await adminExportSettlement(settlParams, { headers: authHeader as Record<string, string> });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `settlement_${settlFrom}_${settlTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: '✅ Excel 다운로드 완료' });
    } catch {
      toast({ title: '다운로드 실패', description: '잠시 후 다시 시도해주세요.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleRegisterSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegPending(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ownerName: regOwner,
          storeName: regStore,
          phone: regPhone,
          category: regCategory,
          address: regAddress,
          detailAddress: regDetailAddress || null,
          latitude: regLat,
          longitude: regLng,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '등록 실패');
      toast({ title: '✅ 판매자 등록 완료', description: `${regStore} (${regPhone})` });
      setRegOwner(''); setRegPhone(''); setRegStore(''); setRegCategory('');
      setRegAddress(''); setRegDetailAddress(''); setRegLat(null); setRegLng(null);
      refetchSellers();
    } catch (err: unknown) {
      toast({ title: '등록 실패', description: err instanceof Error ? err.message : '다시 시도해주세요.', variant: 'destructive' });
    } finally {
      setRegPending(false);
    }
  };

  const navItems = [
    { id: 'stats', label: 'ESG 대시보드', icon: BarChart3 },
    { id: 'register', label: '판매자 등록', icon: UserPlus },
    { id: 'sellers', label: '판매자 승인', icon: Users },
    { id: 'orders', label: '픽업 로그', icon: ListOrdered },
    { id: 'blacklist', label: '블랙리스트', icon: UserX },
    { id: 'settlement', label: '정산 관리', icon: DollarSign },
    { id: 'claims', label: '클레임 관리', icon: MessageSquareWarning },
    { id: 'notices', label: '공지사항', icon: Megaphone },
    { id: 'categories', label: '카테고리 관리', icon: Tag },
    { id: 'settings', label: '시스템 설정', icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-zen-bg flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-56 bg-white border-b md:border-b-0 md:border-r border-zen-border flex flex-col shadow-sm">
        <div className="px-5 py-4 border-b border-zen-border">
          <h1 className="text-base font-bold text-zen-text">라스트 히어로</h1>
          <p className="text-xs font-semibold text-zen-green mt-0.5">Admin Console</p>
        </div>
        <nav className="flex-1 flex flex-row md:flex-col overflow-x-auto md:overflow-visible py-2 gap-0.5">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex items-center px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors rounded-lg mx-1.5 md:mx-2",
                tab === item.id
                  ? "bg-zen-green-bg text-zen-green font-semibold"
                  : "text-zen-sub hover:bg-zen-warm hover:text-zen-text"
              )}
            >
              <item.icon className={cn("w-4 h-4 mr-2.5 flex-shrink-0", tab === item.id ? "text-zen-green" : "text-zen-muted")} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-zen-border">
          <NeoButton variant="neutral" className="w-full text-sm py-2" onClick={onLogout}>로그아웃</NeoButton>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-7 overflow-y-auto max-h-screen">

        {/* ── ESG 대시보드 ── */}
        {tab === 'stats' && stats && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zen-text">ESG 임팩트 대시보드</h2>
              <p className="text-sm text-zen-sub mt-0.5">라스트 히어로가 만든 변화</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="절약한 음식물" value={stats.totalFoodSavedKg.toFixed(1)} unit="kg" icon={Leaf} green />
              <StatCard label="살린 소나무" value={stats.totalTreesSaved.toFixed(1)} unit="그루" icon={TreePine} />
              <StatCard label="총 결제 금액" value={stats.totalDonationAmount.toLocaleString()} unit="원" icon={Heart} green />
              <StatCard label="총 유료 백" value={stats.totalPaidBags} unit="개" icon={BarChart3} />
            </div>

            {/* 월별 차트 */}
            <div className="bg-white border border-zen-border rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-zen-text mb-4">월별 주문 현황</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.monthlyOrders} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E6E1" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B6962' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6B6962' }} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      contentStyle={{ border: '1px solid #E8E6E1', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', fontSize: 12 }}
                      cursor={{ fill: '#EEF4F0' }}
                    />
                    <Bar dataKey="count" fill="#4D7C5F" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 히어로 랭킹 */}
            <div className="bg-white border border-zen-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zen-border">
                <h3 className="font-semibold text-zen-text">히어로 랭킹 Top 5</h3>
              </div>
              <div className="divide-y divide-zen-border">
                {stats.heroRanking.slice(0, 5).map(hero => (
                  <div key={hero.rank} className="px-5 py-3.5 flex items-center justify-between hover:bg-zen-warm transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold",
                        hero.rank === 1 ? "bg-amber-100 text-amber-700" :
                        hero.rank === 2 ? "bg-zinc-100 text-zinc-600" :
                        hero.rank === 3 ? "bg-orange-100 text-orange-700" :
                        "bg-zen-warm text-zen-sub"
                      )}>{hero.rank}</span>
                      <div>
                        <p className="font-semibold text-sm text-zen-text">{hero.customerName || hero.customerPhone}</p>
                        <p className="text-xs text-zen-sub">주문 {hero.totalOrders}회</p>
                      </div>
                    </div>
                    <span className="font-bold text-zen-green text-sm">{hero.esgScore.toFixed(1)}pt</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 판매자 신규 등록 ── */}
        {tab === 'register' && (
          <div className="max-w-lg">
            <h2 className="text-xl font-bold text-zen-text mb-1">판매자 신규 등록</h2>
            <p className="text-sm text-zen-sub mb-6">등록된 번호만 인증번호 0000으로 로그인할 수 있습니다.</p>

            <form onSubmit={handleRegisterSeller} className="bg-white border border-zen-border rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <NeoLabel className="mb-1.5 block">사장님 성함 <span className="text-zen-muted text-xs">(선택)</span></NeoLabel>
                <NeoInput
                  value={regOwner}
                  onChange={e => setRegOwner(e.target.value)}
                  placeholder="홍길동"
                />
              </div>
              <div>
                <NeoLabel className="mb-1.5 block">휴대폰 번호 <span className="text-red-500">*</span></NeoLabel>
                <NeoInput
                  type="tel"
                  inputMode="numeric"
                  value={regPhone}
                  onChange={e => setRegPhone(e.target.value)}
                  placeholder="01012345678"
                  required
                />
              </div>
              <div className="relative">
                <NeoLabel className="mb-1.5 block">가게 이름 <span className="text-red-500">*</span></NeoLabel>
                <div className="relative">
                  <NeoInput
                    value={regStore}
                    onChange={e => { setRegStore(e.target.value); setShowSearchDrop(true); }}
                    onFocus={() => storeSearchResults.length > 0 && setShowSearchDrop(true)}
                    onBlur={() => setTimeout(() => setShowSearchDrop(false), 180)}
                    placeholder="가게명이나 지점명까지 입력해 보세요 (예: 봉담재, 낙원떡집 봉담점)"
                    required
                    autoComplete="off"
                    className="w-full pr-8"
                  />
                  {storeSearchLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-zen-green border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                {showSearchDrop && storeSearchResults.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-zen-border rounded-xl shadow-lg overflow-y-auto max-h-72">
                    <div className="px-3 pt-2 pb-1.5 flex items-center justify-between bg-zen-warm border-b border-zen-border/50">
                      <p className="text-[10px] text-zen-muted font-semibold">클릭하면 주소·좌표 자동 입력</p>
                      {searchSource && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${searchSource === 'kakao' ? 'bg-yellow-100 text-yellow-700' : 'bg-zinc-100 text-zinc-500'}`}>
                          {searchSource === 'kakao' ? '카카오 지도' : 'OpenStreetMap'}
                        </span>
                      )}
                    </div>
                    {storeSearchResults.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => handleSelectPlace(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-zen-warm border-t border-zen-border/50 first:border-t-0 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zen-text truncate">{p.display_name}</p>
                            <p className="text-xs text-zen-muted truncate mt-0.5">📍 {p.road}</p>
                            {(p.category || p.phone) && (
                              <p className="text-[10px] text-zen-muted/70 truncate mt-0.5">
                                {p.category && <span>{p.category.split(' > ').slice(-1)[0]}</span>}
                                {p.category && p.phone && <span> · </span>}
                                {p.phone && <span>{p.phone}</span>}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onMouseDown={() => setShowSearchDrop(false)}
                      className="w-full text-center text-xs text-zen-muted py-2 border-t border-zen-border/50 hover:bg-zen-warm"
                    >
                      닫기 — 주소를 직접 입력할게요
                    </button>
                  </div>
                )}
              </div>
              <div>
                <NeoLabel className="mb-1.5 block">카테고리</NeoLabel>
                {categories.length > 0 ? (
                  <select
                    value={regCategory}
                    onChange={e => setRegCategory(e.target.value)}
                    className="w-full px-3 py-2.5 border border-zen-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zen-green"
                  >
                    <option value="">카테고리 선택...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>
                    ))}
                  </select>
                ) : (
                  <NeoInput
                    value={regCategory}
                    onChange={e => setRegCategory(e.target.value)}
                    placeholder="빵/베이커리, 반찬/밀키트 등"
                  />
                )}
              </div>

              {/* 도로명 주소 + 좌표 변환 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <NeoLabel>도로명 주소 <span className="text-red-500">*</span></NeoLabel>
                  <span className="text-[10px] text-zen-muted bg-zen-warm px-2 py-0.5 rounded-full">위 검색 선택 시 자동 입력 · 직접 수정도 가능</span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <NeoInput
                      value={regAddress}
                      onChange={e => { setRegAddress(e.target.value); setRegLat(null); setRegLng(null); }}
                      placeholder="예: 경기 화성시 봉담읍 왕림길 1"
                      required
                      className="w-full pr-8"
                    />
                    {geocoding && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-zen-green border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleGeocode}
                    disabled={geocoding || !regAddress.trim()}
                    className="flex-shrink-0 px-3 py-2 bg-zen-green text-white text-xs font-bold rounded-xl hover:bg-[#3D6B4F] transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    {geocoding ? '변환 중' : regLat ? '재변환' : '좌표 변환'}
                  </button>
                </div>
                {regLat && regLng ? (
                  <div className="mt-1.5 px-3 py-2 bg-zen-green-bg border border-[#BDD8C6] rounded-lg flex items-center gap-2">
                    <span className="text-xs font-mono text-zen-green">📍 {regLat.toFixed(5)}, {regLng.toFixed(5)}</span>
                    <span className="text-[10px] text-zen-green/70">좌표 변환 완료 ✓</span>
                  </div>
                ) : regAddress.trim().length >= 6 ? (
                  <p className="text-[11px] text-amber-600 mt-1">
                    {geocoding ? '⏳ 좌표 변환 중...' : '⚠ [좌표 변환] 버튼을 눌러야 거리 기반 필터에 노출됩니다'}
                  </p>
                ) : null}
              </div>

              {/* 상세 주소 (시장 상인 배려) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <NeoLabel>상세 주소 <span className="text-zen-muted text-xs">(선택)</span></NeoLabel>
                  <span className="text-[10px] text-zen-muted bg-zen-warm px-2 py-0.5 rounded-full">손님에게 표시 · 위치 계산엔 미사용</span>
                </div>
                <NeoInput
                  value={regDetailAddress}
                  onChange={e => setRegDetailAddress(e.target.value)}
                  placeholder="예: 봉담종합시장 B동 102호, 2층 우측"
                />
                <p className="text-[11px] text-zen-muted mt-1">시장 내 상점, 건물 층수, 동·호수 등 상세 위치를 적어주세요.</p>
              </div>

              <div className="pt-2">
                <NeoButton type="submit" variant="primary" className="w-full py-3" disabled={regPending}>
                  {regPending ? '등록 중...' : <><UserPlus className="w-4 h-4 mr-2 inline" /> 판매자 즉시 등록 (승인 완료)</>}
                </NeoButton>
              </div>
              <p className="text-xs text-zen-muted text-center">등록 즉시 승인 상태로 입점됩니다. 좌표 변환 후 등록하면 앱에 즉시 노출됩니다.</p>
            </form>

            {/* 등록된 판매자 목록 */}
            <div className="mt-8">
              <h3 className="text-base font-bold text-zen-text mb-3">등록된 판매자 목록</h3>
              <div className="space-y-2">
                {sellers?.map(s => (
                  <div key={s.id} className="bg-white border border-zen-border rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-zen-text text-sm">{s.storeName}</span>
                      <span className="text-zen-muted text-xs ml-2">{s.phone}</span>
                    </div>
                    <NeoBadge variant={s.approvalStatus === 'approved' ? 'primary' : 'neutral'}>
                      {s.approvalStatus === 'approved' ? '승인' : s.approvalStatus === 'rejected' ? '거절' : '대기'}
                    </NeoBadge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 판매자 승인 ── */}
        {tab === 'sellers' && (
          <div>
            <h2 className="text-xl font-bold text-zen-text mb-4">판매자 상태 관리</h2>

            {/* 상태 필터 */}
            <div className="flex flex-wrap gap-2 mb-4">
              {([
                { key: 'all', label: '전체' },
                { key: 'pending', label: '승인 대기' },
                { key: 'approved', label: '승인 완료' },
                { key: 'suspended', label: '이용 중지' },
                { key: 'cancelled', label: '승인 취소' },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setSellerStatusFilter(f.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
                    sellerStatusFilter === f.key
                      ? 'bg-[#1C1C1A] text-white border-[#1C1C1A]'
                      : 'bg-white text-zen-sub border-zen-border hover:border-[#1C1C1A]'
                  )}>
                  {f.label}
                  <span className="ml-1.5 opacity-60">
                    {f.key === 'all' ? sellers?.length ?? 0 : sellers?.filter(s => s.approvalStatus === f.key).length ?? 0}
                  </span>
                </button>
              ))}
            </div>

            {/* 사유 입력 모달 */}
            {statusModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                  <h3 className="font-bold text-zen-text mb-1">
                    {statusModal.targetStatus === 'suspended' ? '⚠️ 이용 중지' : '⛔ 승인 취소'}
                  </h3>
                  <p className="text-sm text-zen-sub mb-4">
                    <strong>{statusModal.storeName}</strong>에 대한 처리 사유를 입력하세요.
                  </p>
                  <textarea
                    className="w-full border border-zen-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#4D7C5F]"
                    rows={3}
                    placeholder="예: 허위 상품 등록, 노쇼 반복 등 (선택 입력)"
                    value={reasonInput}
                    onChange={e => setReasonInput(e.target.value)}
                  />
                  <div className="flex gap-2 mt-4">
                    <NeoButton variant="neutral" className="flex-1" onClick={() => setStatusModal(null)}>
                      취소
                    </NeoButton>
                    <NeoButton
                      variant={statusModal.targetStatus === 'cancelled' ? 'destructive' : 'primary'}
                      className="flex-1"
                      onClick={confirmStatusModal}>
                      확정
                    </NeoButton>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {(() => {
                const filtered = sellerStatusFilter === 'all'
                  ? sellers ?? []
                  : (sellers ?? []).filter(s => s.approvalStatus === sellerStatusFilter);
                if (filtered.length === 0) return (
                  <div className="text-center py-16 text-zen-muted">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">해당 상태의 판매자가 없습니다</p>
                  </div>
                );
                return filtered.map(seller => {
                  const st = (seller as any).approvalStatus ?? 'pending';
                  const reason = (seller as any).suspendReason as string | null;
                  const badgeCfg: Record<string, { label: string; color: string }> = {
                    pending:   { label: '승인 대기', color: 'bg-amber-100 text-amber-700 border-amber-200' },
                    approved:  { label: '승인 완료', color: 'bg-[#EEF4F0] text-[#4D7C5F] border-[#4D7C5F]/20' },
                    rejected:  { label: '거절',      color: 'bg-red-50 text-[#C0392B] border-red-200' },
                    suspended: { label: '이용 중지', color: 'bg-orange-50 text-orange-700 border-orange-200' },
                    cancelled: { label: '승인 취소', color: 'bg-gray-100 text-gray-500 border-gray-200' },
                  };
                  const cfg = badgeCfg[st] ?? badgeCfg.pending;
                  return (
                <div key={seller.id} className="bg-white border border-zen-border rounded-xl overflow-hidden shadow-sm">
                  {/* 상단: 판매자 기본 정보 + 상태 버튼 */}
                  <div className="p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                            <h3 className="font-bold text-zen-text">{seller.storeName || '(매장명 미등록)'}</h3>
                            <span className={cn('text-xs font-bold px-2.5 py-0.5 rounded-full border', cfg.color)}>
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-sm text-zen-sub">{seller.address || '주소 미입력'} · {seller.phone}</p>
                          <p className="text-xs text-zen-muted mt-1">픽업 {seller.totalPickups}회 · 노쇼 {seller.totalNoShows}회</p>
                          {reason && (
                            <p className="text-xs text-orange-600 mt-1.5 bg-orange-50 border border-orange-100 rounded-lg px-2 py-1">
                              📋 사유: {reason}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* 상태 변경 버튼 행 */}
                      <div className="flex flex-wrap gap-1.5">
                        {st !== 'approved' && (
                          <NeoButton size="sm" variant="primary"
                            onClick={() => handleStatusChange(seller.id, 'approved')}>
                            ✅ 승인
                          </NeoButton>
                        )}
                        {st !== 'pending' && (
                          <NeoButton size="sm" variant="neutral"
                            onClick={() => handleStatusChange(seller.id, 'pending')}>
                            ⏳ 대기
                          </NeoButton>
                        )}
                        {st !== 'suspended' && (
                          <NeoButton size="sm" variant="neutral"
                            className="border-orange-300 text-orange-600 hover:bg-orange-50"
                            onClick={() => openStatusModal(seller.id, seller.storeName || '', 'suspended')}>
                            ⚠️ 중지
                          </NeoButton>
                        )}
                        {st !== 'cancelled' && (
                          <NeoButton size="sm" variant="destructive"
                            onClick={() => openStatusModal(seller.id, seller.storeName || '', 'cancelled')}>
                            ⛔ 취소
                          </NeoButton>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 하단: 최대 판매가 설정 */}
                  <div className="border-t border-zen-border bg-zen-warm px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <DollarSign className="w-3.5 h-3.5 text-zen-green" />
                        <span className="text-xs font-bold text-zen-sub">최대 등록금액</span>
                        <span className="text-xs font-black text-zen-green bg-zen-green-bg px-2 py-0.5 rounded-full">
                          현재 {(seller.maxPrice ?? 10000).toLocaleString()}원
                        </span>
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1000"
                            max="1000000"
                            step="1000"
                            placeholder={(seller.maxPrice ?? 10000).toString()}
                            value={maxPriceInputs[seller.id] ?? ''}
                            onChange={e => setMaxPriceInputs(prev => ({ ...prev, [seller.id]: e.target.value }))}
                            className="w-28 pl-3 pr-7 py-1.5 border-[1.5px] border-zen-border rounded-lg text-sm font-bold text-zen-text focus:outline-none focus:border-zen-green bg-white transition-colors"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zen-muted font-medium">원</span>
                        </div>
                        <button
                          onClick={() => handleSaveMaxPrice(seller.id)}
                          disabled={maxPriceSaving[seller.id] || !maxPriceInputs[seller.id]}
                          className="px-3 py-1.5 bg-zen-green text-white text-xs font-bold rounded-lg hover:bg-[#3D6B4F] transition-colors disabled:opacity-40 flex items-center gap-1"
                        >
                          {maxPriceSaving[seller.id] ? '...' : '저장'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ); }); })()}
            </div>
          </div>
        )}

        {/* ── 픽업 로그 ── */}
        {tab === 'orders' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-zen-text">픽업 로그</h2>
              {ordersData && (
                <span className="text-sm text-zen-sub">
                  전체 {ordersData.total.toLocaleString()}건
                </span>
              )}
            </div>
            <div className="bg-white border border-zen-border rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zen-border bg-zen-warm text-left">
                      <th className="px-4 py-3 font-semibold text-zen-sub text-xs uppercase tracking-wide">ID</th>
                      <th className="px-4 py-3 font-semibold text-zen-sub text-xs uppercase tracking-wide">매장</th>
                      <th className="px-4 py-3 font-semibold text-zen-sub text-xs uppercase tracking-wide">고객</th>
                      <th className="px-4 py-3 font-semibold text-zen-sub text-xs uppercase tracking-wide text-right">금액</th>
                      <th className="px-4 py-3 font-semibold text-zen-sub text-xs uppercase tracking-wide">상태</th>
                      <th className="px-4 py-3 font-semibold text-zen-sub text-xs uppercase tracking-wide">시간</th>
                      <th className="px-4 py-3 font-semibold text-zen-sub text-xs uppercase tracking-wide">강제취소</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zen-border">
                    {orders?.map(order => (
                      <tr key={order.id} className="hover:bg-zen-warm transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-zen-muted">{order.id}</td>
                        <td className="px-4 py-3 font-semibold text-zen-text">{order.sellerName}</td>
                        <td className="px-4 py-3 text-zen-sub">{order.customerPhone}</td>
                        <td className="px-4 py-3 text-right font-mono text-zen-text">{order.amount.toLocaleString()}원</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                            order.pickupStatus === 'picked_up' || order.pickupStatus === 'completed'
                              ? "bg-zen-green-bg text-zen-green"
                              : order.pickupStatus === 'cancelled'
                              ? "bg-[#F5F3EF] text-zen-muted"
                              : order.pickupStatus === 'no_show'
                              ? "bg-zen-red-bg text-zen-red"
                              : "bg-zen-warm text-zen-sub"
                          )}>
                            {order.pickupStatus === 'picked_up' || order.pickupStatus === 'completed' ? <CheckCircle className="w-3 h-3" /> :
                             order.pickupStatus === 'cancelled' ? <Ban className="w-3 h-3" /> :
                             order.pickupStatus === 'no_show' ? <XCircle className="w-3 h-3" /> :
                             <Clock className="w-3 h-3" />}
                            {order.pickupStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-zen-muted">
                          {new Date(order.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          {order.pickupStatus === 'pending' && (
                            <button
                              onClick={() => handleForceCancel(order.id)}
                              disabled={forceCancelling === order.id}
                              className="text-[11px] bg-[#FDF2F1] text-[#C0392B] border border-[#F5C6C2] px-2 py-1 rounded-lg font-bold hover:bg-[#C0392B] hover:text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              {forceCancelling === order.id ? '처리 중...' : '강제취소'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {ordersLoading && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-zen-muted text-sm">불러오는 중...</td></tr>
                    )}
                    {!ordersLoading && orders?.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-zen-muted text-sm">주문 데이터가 없습니다</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* 페이지네이션 */}
              {ordersData && ordersData.total > ORDERS_PAGE_SIZE && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-zen-border bg-zen-warm">
                  <button
                    onClick={() => setOrdersPage(p => Math.max(1, p - 1))}
                    disabled={ordersPage <= 1 || ordersLoading}
                    className="px-4 py-1.5 text-sm font-semibold text-zen-text border border-zen-border rounded-lg bg-white hover:bg-zen-warm disabled:opacity-40 transition-colors"
                  >
                    ← 이전
                  </button>
                  <span className="text-sm text-zen-sub">
                    {ordersPage} / {Math.ceil(ordersData.total / ORDERS_PAGE_SIZE)} 페이지
                    <span className="ml-2 text-zen-muted text-xs">(총 {ordersData.total}건)</span>
                  </span>
                  <button
                    onClick={() => setOrdersPage(p => p + 1)}
                    disabled={ordersPage >= Math.ceil(ordersData.total / ORDERS_PAGE_SIZE) || ordersLoading}
                    className="px-4 py-1.5 text-sm font-semibold text-zen-text border border-zen-border rounded-lg bg-white hover:bg-zen-warm disabled:opacity-40 transition-colors"
                  >
                    다음 →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 블랙리스트 ── */}
        {tab === 'blacklist' && (
          <div>
            <h2 className="text-xl font-bold text-zen-text mb-2">블랙리스트 관리</h2>
            <div className="flex items-start gap-2 bg-zen-red-bg border border-[#E8C4C0] rounded-xl px-4 py-3 mb-5">
              <AlertTriangle className="w-4 h-4 text-zen-red mt-0.5 flex-shrink-0" />
              <p className="text-sm text-zen-red">노쇼 3회 이상 고객은 자동으로 차단됩니다. 아래에서 수동으로도 등록/해제할 수 있습니다.</p>
            </div>

            {/* 수동 추가 폼 */}
            <div className="bg-white border border-zen-border rounded-xl p-4 shadow-sm mb-5">
              <h3 className="font-semibold text-zen-text text-sm mb-3">수동 등록</h3>
              <form onSubmit={handleAddBlacklist} className="flex gap-2 flex-wrap">
                <NeoInput
                  placeholder="전화번호 (010-XXXX-XXXX)"
                  value={blPhone}
                  onChange={e => setBlPhone(e.target.value)}
                  type="tel"
                  inputMode="numeric"
                  className="flex-1 min-w-36"
                  required
                />
                <NeoInput
                  placeholder="사유 (선택)"
                  value={blReason}
                  onChange={e => setBlReason(e.target.value)}
                  className="flex-1 min-w-36"
                />
                <NeoButton type="submit" variant="destructive" disabled={addBlPending} className="whitespace-nowrap">
                  {addBlPending ? '...' : '차단 등록'}
                </NeoButton>
              </form>
            </div>

            {/* 목록 */}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {blacklist?.map(item => (
                <div key={item.id} className={cn(
                  "bg-white border border-zen-border rounded-xl p-4 shadow-sm flex justify-between items-center",
                  item.isBlocked && "border-[#E8C4C0] bg-zen-red-bg/30"
                )}>
                  <div>
                    <p className="font-semibold text-zen-text text-sm">{item.phone}</p>
                    <p className="text-xs text-zen-sub mt-0.5">노쇼 {item.noShowCount}회</p>
                    {(item as Record<string, unknown>).reason && (
                      <p className="text-xs text-zen-muted mt-0.5">{String((item as Record<string, unknown>).reason)}</p>
                    )}
                  </div>
                  <NeoButton
                    size="sm"
                    variant={item.isBlocked ? 'neutral' : 'destructive'}
                    onClick={() => handleToggleBlacklist(item.id, item.isBlocked)}
                  >
                    {item.isBlocked ? '해제' : '차단'}
                  </NeoButton>
                </div>
              ))}
              {blacklist?.length === 0 && (
                <div className="col-span-full text-center py-16 text-zen-muted">
                  <UserX className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">블랙리스트가 비어 있습니다</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 정산 관리 ── */}
        {tab === 'settlement' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-xl font-bold text-zen-text">정산 관리</h2>
                <p className="text-sm text-zen-sub mt-0.5">수수료 15% (플랫폼 12% + PG 3%) 차감 후 입금액</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={settlFrom}
                  onChange={e => setSettlFrom(e.target.value)}
                  className="border border-zen-border rounded-lg px-3 py-1.5 text-sm text-zen-text bg-white focus:outline-none focus:border-zen-green"
                />
                <span className="text-zen-muted text-sm">~</span>
                <input
                  type="date"
                  value={settlTo}
                  onChange={e => setSettlTo(e.target.value)}
                  className="border border-zen-border rounded-lg px-3 py-1.5 text-sm text-zen-text bg-white focus:outline-none focus:border-zen-green"
                />
                <NeoButton variant="neutral" onClick={() => refetchSettlement()}>조회</NeoButton>
              </div>
            </div>

            <div className="flex justify-end mb-3">
              <NeoButton variant="secondary" onClick={handleExportExcel} disabled={exporting} className="flex items-center gap-1.5">
                <Download className="w-4 h-4" />
                {exporting ? '생성 중...' : 'Excel 다운로드'}
              </NeoButton>
            </div>

            <div className="bg-white border border-zen-border rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zen-border bg-zen-warm text-left">
                      <th className="px-4 py-3 font-semibold text-zen-sub text-xs uppercase tracking-wide">매장명</th>
                      <th className="px-4 py-3 font-semibold text-zen-sub text-xs uppercase tracking-wide">계좌번호</th>
                      <th className="px-4 py-3 font-semibold text-zen-sub text-xs uppercase tracking-wide text-right">총 판매액</th>
                      <th className="px-4 py-3 font-semibold text-zen-red text-xs uppercase tracking-wide text-right">수수료 (15%)</th>
                      <th className="px-4 py-3 font-semibold text-zen-green text-xs uppercase tracking-wide text-right">입금 예정액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zen-border">
                    {settlement?.map(s => (
                      <tr key={s.sellerId} className="hover:bg-zen-warm transition-colors">
                        <td className="px-4 py-3 font-semibold text-zen-text">{s.sellerName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-zen-sub">{s.bankAccount || '미등록'}</td>
                        <td className="px-4 py-3 text-right font-mono text-zen-text">{s.totalSales.toLocaleString()}원</td>
                        <td className="px-4 py-3 text-right font-mono text-zen-red">
                          -{(s.platformFee + s.pgFee).toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-right font-bold font-mono text-zen-green">{s.netAmount.toLocaleString()}원</td>
                      </tr>
                    ))}
                    {settlement?.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-12 text-center text-zen-muted text-sm">해당 기간의 정산 데이터가 없습니다</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {settlement && settlement.length > 0 && (
                <div className="border-t border-zen-border px-4 py-3 bg-zen-warm flex justify-between items-center">
                  <span className="text-sm font-semibold text-zen-sub">합계</span>
                  <span className="font-bold text-zen-green">
                    {settlement.reduce((s, r) => s + r.netAmount, 0).toLocaleString()}원
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 클레임 관리 ── */}
        {tab === 'claims' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-zen-text">클레임 관리</h2>
                <p className="text-sm text-zen-sub mt-0.5">구매자 신고 접수 및 처리 현황</p>
              </div>
              <NeoButton variant="neutral" onClick={fetchClaims} disabled={claimsLoading}>
                {claimsLoading ? '로딩...' : '새로고침'}
              </NeoButton>
            </div>

            {/* 통계 요약 */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: '전체', count: claims.length, color: 'text-zen-text' },
                { label: '처리 대기', count: claims.filter(c => c.status === 'pending').length, color: 'text-[#C0392B]' },
                { label: '처리 완료', count: claims.filter(c => c.status === 'resolved').length, color: 'text-[#4D7C5F]' },
              ].map(s => (
                <div key={s.label} className="bg-white border border-zen-border rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                  <p className="text-xs text-zen-sub mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {claimsLoading ? (
              <div className="text-center py-12 text-zen-muted text-sm">불러오는 중...</div>
            ) : claims.length === 0 ? (
              <div className="text-center py-12 text-zen-muted text-sm">
                <MessageSquareWarning className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>접수된 클레임이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-3">
                {claims.map(claim => (
                  <div key={claim.id} className="bg-white border border-zen-border rounded-xl overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-zen-border flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className={cn(
                          "text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0",
                          claim.status === 'pending' ? 'bg-[#FDF2F1] text-[#C0392B]' :
                          claim.status === 'in_progress' ? 'bg-[#FFFBEB] text-[#92400E]' :
                          'bg-zen-green-bg text-zen-green'
                        )}>
                          {claim.status === 'pending' ? '● 대기' : claim.status === 'in_progress' ? '● 처리 중' : '✓ 완료'}
                        </span>
                        <span className="text-xs font-semibold text-zen-sub truncate">
                          #{claim.id} · {claim.sellerName ?? '판매자'}
                        </span>
                      </div>
                      <span className="text-xs text-zen-muted flex-shrink-0">
                        {new Date(claim.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-xs bg-zen-warm border border-zen-border rounded px-2 py-0.5 font-medium text-zen-sub flex-shrink-0">
                          {claim.category === 'food_safety' ? '🦠 식품 안전' :
                           claim.category === 'quality' ? '📦 품질 불량' :
                           claim.category === 'no_show_seller' ? '🚪 판매자 부재' : '📝 기타'}
                        </span>
                        <span className="text-xs text-zen-sub">{claim.customerPhone}</span>
                      </div>
                      <p className="text-sm text-zen-text leading-relaxed">{claim.description}</p>
                      {claim.sellerResponse && (
                        <div className="bg-zen-green-bg border border-[#BDD8C6] rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-zen-green mb-0.5">판매자 답변</p>
                          <p className="text-xs text-zen-text leading-relaxed">{claim.sellerResponse}</p>
                        </div>
                      )}
                    </div>
                    {claim.status !== 'resolved' && (
                      <div className="px-4 py-3 bg-zen-warm border-t border-zen-border flex gap-2">
                        {claim.status === 'pending' && (
                          <button
                            onClick={() => handleClaimStatus(claim.id, 'in_progress')}
                            className="flex-1 py-2 text-xs font-bold border border-[#E8E6E1] bg-white rounded-lg hover:border-[#4D7C5F] text-zen-text transition-colors"
                          >
                            처리 중으로 변경
                          </button>
                        )}
                        <button
                          onClick={() => handleClaimStatus(claim.id, 'resolved')}
                          className="flex-1 py-2 text-xs font-bold bg-[#4D7C5F] text-white rounded-lg hover:bg-[#3d6b4f] transition-colors"
                        >
                          ✓ 처리 완료
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 공지사항 ── */}
        {tab === 'notices' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zen-text">공지사항 관리</h2>
              <p className="text-sm text-zen-sub mt-0.5">판매자·소비자 공지를 한 곳에서 발행합니다</p>
            </div>

            {/* 작성 폼 */}
            <div className="bg-white border border-zen-border rounded-2xl p-5 space-y-4">
              <h3 className="font-bold text-zen-text">새 공지 작성</h3>
              <div>
                <NeoLabel>제목</NeoLabel>
                <NeoInput
                  value={noticeTitle}
                  onChange={e => setNoticeTitle(e.target.value)}
                  placeholder="공지 제목을 입력하세요"
                />
              </div>
              <div>
                <NeoLabel>내용</NeoLabel>
                <textarea
                  value={noticeContent}
                  onChange={e => setNoticeContent(e.target.value)}
                  placeholder="공지 내용을 입력하세요"
                  rows={4}
                  className="w-full px-3 py-2.5 border border-zen-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zen-green/30"
                />
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <NeoLabel>대상</NeoLabel>
                  <select
                    value={noticeTarget}
                    onChange={e => setNoticeTarget(e.target.value as 'all' | 'customer' | 'seller')}
                    className="px-3 py-2 border border-zen-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zen-green/30"
                  >
                    <option value="all">전체 (판매자 + 소비자)</option>
                    <option value="seller">판매자 전용</option>
                    <option value="customer">소비자 전용</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 mt-5">
                  <input
                    type="checkbox"
                    id="isPinned"
                    checked={noticePinned}
                    onChange={e => setNoticePinned(e.target.checked)}
                    className="w-4 h-4 accent-zen-green"
                  />
                  <label htmlFor="isPinned" className="text-sm text-zen-text font-medium">상단 고정</label>
                </div>
              </div>
              <NeoButton
                variant="primary"
                className="w-full py-3"
                onClick={handleNoticePost}
                disabled={noticePosting}
              >
                {noticePosting ? '발행 중...' : '📢 공지 발행'}
              </NeoButton>
            </div>

            {/* 공지 목록 */}
            <div className="space-y-3">
              {noticesLoading ? (
                <p className="text-center text-sm text-zen-sub py-8">불러오는 중...</p>
              ) : notices.length === 0 ? (
                <div className="text-center py-12 text-zen-muted bg-white rounded-2xl border border-zen-border">
                  <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">발행된 공지가 없습니다</p>
                </div>
              ) : notices.map(n => (
                <div key={n.id} className="bg-white border border-zen-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-zen-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {n.isPinned === 'true' && <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">📌 고정</span>}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        n.target === 'seller' ? 'bg-[#EEF4F0] text-[#4D7C5F]' :
                        n.target === 'customer' ? 'bg-blue-50 text-blue-700' :
                        'bg-[#F5F3EF] text-[#6B6962]'
                      }`}>
                        {n.target === 'seller' ? '판매자' : n.target === 'customer' ? '소비자' : '전체'}
                      </span>
                      <span className="font-semibold text-sm text-zen-text">{n.title}</span>
                    </div>
                    <button
                      onClick={() => handleNoticeDelete(n.id)}
                      className="p-1.5 text-zen-muted hover:text-[#C0392B] hover:bg-[#FDF2F1] rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-sm text-zen-sub whitespace-pre-wrap">{n.content}</p>
                    <p className="text-xs text-zen-muted mt-2">
                      {format(new Date(n.createdAt), 'yyyy년 M월 d일 HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 카테고리 관리 ── */}
        {tab === 'categories' && (
          <div className="max-w-lg">
            <h2 className="text-xl font-bold text-zen-text mb-2">카테고리 관리</h2>
            <p className="text-sm text-zen-sub mb-6">여기서 추가한 카테고리가 판매자 등록 폼과 앱 카테고리 필터에 즉시 반영됩니다.</p>

            {/* 카테고리 추가 폼 */}
            <div className="bg-white border border-zen-border rounded-2xl p-5 shadow-sm mb-4">
              <h3 className="font-bold text-zen-text mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-zen-green" />
                새 카테고리 추가
              </h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={catEmoji}
                  onChange={e => setCatEmoji(e.target.value)}
                  placeholder="🎁"
                  className="w-16 px-2 py-2.5 text-center border border-zen-border rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-zen-green"
                  maxLength={4}
                />
                <NeoInput
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  placeholder="카테고리명 (예: 빵/베이커리, 가전제품)"
                  className="flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                />
                <NeoButton
                  type="button"
                  variant="primary"
                  onClick={handleAddCategory}
                  disabled={catPending || !catName.trim()}
                  className="flex-shrink-0 px-4"
                >
                  {catPending ? '...' : '추가'}
                </NeoButton>
              </div>
              <p className="text-xs text-zen-muted">음식뿐만 아니라 공산품, 가전, 의류 등 어떤 카테고리도 추가할 수 있습니다.</p>
            </div>

            {/* 카테고리 목록 */}
            <div className="bg-white border border-zen-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-zen-border bg-zen-warm">
                <h3 className="font-bold text-zen-text text-sm">등록된 카테고리 ({categories.length})</h3>
              </div>
              {categories.length === 0 ? (
                <div className="px-5 py-10 text-center text-zen-muted">
                  <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">등록된 카테고리가 없습니다.<br/>위에서 첫 번째 카테고리를 추가해보세요!</p>
                </div>
              ) : (
                <div className="divide-y divide-zen-border">
                  {categories.map(cat => (
                    <div key={cat.id} className="flex items-center gap-3 px-5 py-3 hover:bg-zen-warm transition-colors">
                      <span className="text-2xl flex-shrink-0">{cat.emoji}</span>
                      <span className="flex-1 font-semibold text-zen-text">{cat.name}</span>
                      <button
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="p-1.5 text-zen-muted hover:text-[#C0392B] hover:bg-[#FDF2F1] rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 bg-[#EEF4F0] border border-[#BDD8C6] rounded-2xl p-4">
              <div className="flex items-start gap-2">
                <Tag className="w-4 h-4 text-[#4D7C5F] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#4D7C5F] mb-1">무한 확장 카테고리 시스템</p>
                  <p className="text-xs text-[#4D7C5F]/80 leading-relaxed">
                    추가한 카테고리는 ① 판매자 등록 폼 드롭다운, ② 앱 홈 필터 칩에 즉시 반영됩니다.
                    음식 외에 공산품·가전·의류 등 어떤 업종이든 별도 개발 없이 확장할 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 시스템 설정 ── */}
        {tab === 'settings' && (
          <div className="max-w-lg">
            <h2 className="text-xl font-bold text-zen-text mb-2">시스템 설정</h2>
            <p className="text-sm text-zen-sub mb-6">언니 손가락 하나로 시스템 전체를 제어합니다.</p>

            {/* 유저 취소 허용 토글 */}
            <div className="bg-white border border-zen-border rounded-2xl shadow-sm overflow-hidden mb-4">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Ban className="w-4 h-4 text-zen-sub" />
                      <h3 className="font-bold text-zen-text">유저 직접 취소 허용</h3>
                    </div>
                    <p className="text-sm text-zen-sub leading-relaxed">
                      {allowUserCancel
                        ? '현재 ON — 마감 15분 전까지 유저가 직접 취소할 수 있습니다.'
                        : '현재 OFF — 모든 유저 화면에서 취소 버튼이 숨겨집니다.'}
                    </p>
                    <div className={cn(
                      "mt-3 px-3 py-2 rounded-xl text-xs font-semibold border",
                      allowUserCancel
                        ? "bg-[#EEF4F0] border-[#BDD8C6] text-[#4D7C5F]"
                        : "bg-[#FDF2F1] border-[#F5C6C2] text-[#C0392B]"
                    )}>
                      {allowUserCancel
                        ? '📣 결제 페이지 문구: "마감 15분 전까지는 직접 취소가 가능합니다."'
                        : '📣 결제 페이지 문구: "본 상품은 취소 및 환불이 절대 불가합니다."'}
                    </div>
                  </div>

                  {/* 토글 버튼 */}
                  <button
                    onClick={() => toggleCancelSetting(!allowUserCancel)}
                    disabled={settingsLoading || allowUserCancel === null}
                    className="flex-shrink-0 flex items-center gap-1.5 mt-0.5 disabled:opacity-50"
                  >
                    {allowUserCancel
                      ? <ToggleRight className="w-12 h-12 text-[#4D7C5F]" />
                      : <ToggleLeft className="w-12 h-12 text-[#C5C3BC]" />}
                  </button>
                </div>
              </div>

              <div className="border-t border-zen-border bg-zen-warm px-5 py-3">
                <p className="text-xs text-zen-muted">
                  ⚡ 변경 즉시 반영 — 토글 후 유저 앱이 다음 로드 시 자동으로 새 설정을 적용합니다.
                </p>
              </div>
            </div>

            {/* 어드민 강제취소 안내 */}
            <div className="bg-[#EEF4F0] border border-[#BDD8C6] rounded-2xl p-4">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-[#4D7C5F] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#4D7C5F] mb-1">어드민 강제취소 권한</p>
                  <p className="text-xs text-[#4D7C5F]/80 leading-relaxed">
                    유저 취소가 차단(OFF) 상태여도, 어드민은 <strong>픽업 로그</strong> 탭에서 언제든 강제취소 + PG 환불을 처리할 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null
  );

  const handleLogin = (newToken: string) => {
    localStorage.setItem('admin_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
  };

  if (!token) return <AdminAuth onLogin={handleLogin} />;
  return <AdminDashboard token={token} onLogout={handleLogout} />;
}
