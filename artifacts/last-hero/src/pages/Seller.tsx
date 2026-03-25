import React, { useState, useEffect } from 'react';
import { 
  useGetSellerProfile, 
  useCreateSellerProfile, 
  useListSellerBags,
  useListSellerOrders,
  useCreateBag,
  useUpdateBag,
  useConfirmPickup,
  getGetSellerProfileQueryKey,
  getListSellerBagsQueryKey,
  getListSellerOrdersQueryKey,
  type BagType
} from '@workspace/api-client-react';
import { NeoButton, NeoInput, NeoLabel, NeoBadge, cn } from '@/components/NeoUI';
import { QrScanner } from '@/components/QrScanner';
import SellerTermsModal, { getSellerTermsAgreed, setSellerTermsAgreed } from '@/components/SellerTermsModal';
import { useToast } from '@/hooks/use-toast';
import { Store, ShoppingBag, QrCode, LogOut, Plus, RefreshCw, CheckCircle, TrendingUp, Camera, CameraOff, BarChart2, Calendar, Clock, ChevronRight } from 'lucide-react';
import { format, startOfWeek, isAfter, startOfDay, subDays, startOfMonth, endOfMonth, endOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';

function fmtKRWShort(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만원`;
  return `${n.toLocaleString('ko-KR')}원`;
}

const BAG_CATEGORIES = [
  { value: '빵/베이커리',      emoji: '🥐', label: '빵/베이커리',      image: 'cat-bread.png'   },
  { value: '떡/한과',         emoji: '🍡', label: '떡/한과',           image: 'cat-tteok.png'   },
  { value: '반찬/밀키트',     emoji: '🥘', label: '반찬/밀키트',       image: 'cat-banchan.png' },
  { value: '닭강정/치킨',     emoji: '🍗', label: '닭강정/치킨',       image: 'cat-chicken.png' },
  { value: '분식/타코야끼',   emoji: '🍢', label: '분식/타코야끼',     image: 'cat-bunsik.png'  },
  { value: '도시락/컵밥',     emoji: '🍱', label: '도시락/컵밥',       image: 'cat-dosirak.png' },
  { value: '족발/보쌈',       emoji: '🥩', label: '족발/보쌈',         image: 'cat-jokbal.png'  },
  { value: '카페/디저트/마카롱', emoji: '☕', label: '카페/디저트',    image: 'cat-dessert.png' },
  { value: '기타/서프라이즈', emoji: '🎁', label: '기타/서프라이즈',   image: 'cat-other.png'   },
];

const SELLER_AUTH_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function SellerAuth({ onLogin }: { onLogin: (token: string, phone: string) => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${SELLER_AUTH_BASE}/api/seller/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const isCancelled = data.error === 'AccountCancelled';
        const isUnregistered = data.error === 'Unregistered';
        toast({
          title: isCancelled ? '⛔ 계정 취소됨' : isUnregistered ? '미등록 판매자' : '로그인 실패',
          description: data.message || '다시 시도해주세요.',
          variant: 'destructive',
        });
        return;
      }
      onLogin(data.token, phone);
    } catch {
      toast({ title: '네트워크 오류', description: '인터넷 연결을 확인해주세요.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zen-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zen-text mb-1">라스트 히어로</h1>
          <span className="text-sm font-semibold text-zen-green bg-zen-green-bg px-3 py-1 rounded-full">
            판매자 포털
          </span>
        </div>

        <div className="bg-white border border-zen-border rounded-2xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
          <h2 className="text-xl font-bold text-zen-text mb-1">로그인</h2>
          <p className="text-sm text-zen-sub mb-6">휴대폰 번호와 비밀번호를 입력하세요</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <NeoLabel className="mb-2 block">휴대폰 번호</NeoLabel>
              <NeoInput
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="010-1234-5678"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <NeoLabel className="mb-2 block">비밀번호</NeoLabel>
              <div className="relative">
                <NeoInput
                  type={showPw ? 'text' : 'password'}
                  inputMode="numeric"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zen-muted hover:text-zen-green transition-colors font-medium"
                >
                  {showPw ? '숨기기' : '보기'}
                </button>
              </div>
            </div>
            <NeoButton type="submit" variant="primary" className="w-full py-3.5" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </NeoButton>
          </form>

          {/* 초기 비밀번호 안내 툴팁 */}
          <div className="mt-4 bg-zen-warm border border-zen-border rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-lg flex-shrink-0">💡</span>
            <div>
              <p className="text-xs font-bold text-zen-text mb-0.5">최초 로그인 안내</p>
              <p className="text-xs text-zen-sub leading-relaxed">
                어드민에서 등록된 <strong>휴대폰 번호</strong>가 아이디입니다.<br />
                초기 비밀번호는 <code className="bg-zen-green-bg text-zen-green font-black px-1.5 py-0.5 rounded text-sm">0000</code> 입니다.<br />
                <span className="text-zen-muted">로그인 후 [매장 관리] 탭에서 비밀번호를 변경할 수 있어요.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SELLER_API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function SellerDashboard({ token, onLogout }: { token: string, onLogout: () => void }) {
  const [tab, setTab] = useState<'store' | 'bags' | 'pickup' | 'sales'>('store');
  const [salesPeriod, setSalesPeriod] = useState<'today' | 'yesterday' | 'week' | 'month'>('today');
  const { toast } = useToast();
  
  const authHeader = { Authorization: `Bearer ${token}` };

  // ── 판매자 공지 ──
  interface NoticeItem { id: number; title: string; content: string; target: string; }
  const [sellerNotices, setSellerNotices] = useState<NoticeItem[]>([]);
  useEffect(() => {
    fetch(`${SELLER_API_BASE}/api/notices?target=seller`)
      .then(r => r.json())
      .then(d => setSellerNotices(Array.isArray(d) ? d.slice(0, 3) : []))
      .catch(() => {});
  }, []);

  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useGetSellerProfile({
    request: { headers: authHeader },
    query: { queryKey: getGetSellerProfileQueryKey(), retry: false }
  });

  const { mutate: createProfile, isPending: createProfilePending } = useCreateSellerProfile({
    request: { headers: authHeader }
  });

  const { data: bags, refetch: refetchBags } = useListSellerBags({
    request: { headers: authHeader },
    query: { queryKey: getListSellerBagsQueryKey(), enabled: !!profile }
  });

  const { mutate: createBag, isPending: createBagPending } = useCreateBag({
    request: { headers: authHeader }
  });

  const { mutate: updateBag, isPending: updateBagPending } = useUpdateBag({
    request: { headers: authHeader }
  });

  const { mutate: confirmPickup, isPending: confirmPending } = useConfirmPickup({
    request: { headers: authHeader }
  });

  const { data: orders, refetch: refetchOrders } = useListSellerOrders({
    request: { headers: authHeader },
    query: { queryKey: getListSellerOrdersQueryKey(), enabled: !!profile, staleTime: 30_000 }
  });

  // Store Form State (with useEffect to sync from loaded profile)
  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [district, setDistrict] = useState('');
  const [showContact, setShowContact] = useState(true);
  const [contactPhone, setContactPhone] = useState('');

  // Password Change State
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast({ title: '비밀번호 불일치', description: '새 비밀번호와 확인 비밀번호가 다릅니다.', variant: 'destructive' });
      return;
    }
    if (newPw.length < 4) {
      toast({ title: '비밀번호 오류', description: '비밀번호는 4자리 이상이어야 합니다.', variant: 'destructive' });
      return;
    }
    setChangePwLoading(true);
    try {
      const res = await fetch(`${SELLER_API_BASE}/api/seller/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: '변경 실패', description: data.message || '오류가 발생했습니다.', variant: 'destructive' });
        return;
      }
      toast({ title: '✅ 비밀번호 변경 완료', description: '새 비밀번호로 로그인해주세요.' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch {
      toast({ title: '네트워크 오류', description: '인터넷 연결을 확인해주세요.', variant: 'destructive' });
    } finally {
      setChangePwLoading(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setStoreName(profile.storeName || '');
      setAddress(profile.address || '');
      setBankAccount(profile.bankAccount || '');
      setDistrict(profile.district || '');
      setShowContact(profile.showContact ?? true);
      setContactPhone(profile.contactPhone || '');
      if (profile.storeName) setTab('bags');
    }
  }, [profile]);

  // Bag Form State
  const [bagType, setBagType] = useState<BagType>('paid');
  const [bagCategory, setBagCategory] = useState('빵/베이커리');
  const [bagDescription, setBagDescription] = useState('');
  const [costPrice, setCostPrice] = useState('10000');
  const [discountRate, setDiscountRate] = useState(50);
  const [customRate, setCustomRate] = useState('');
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [bagQty, setBagQty] = useState('5');
  const [bagClosing, setBagClosing] = useState('');

  // 실시간 가격 계산 (판매자별 최대 금액 적용)
  const sellerMaxPrice = profile?.maxPrice ?? 10000;
  const effectiveRate = useCustomRate ? Number(customRate) || 0 : discountRate;
  const finalPrice = bagType === 'free' ? 0 : Math.min(Math.max(Math.round(Number(costPrice) * (1 - effectiveRate / 100)), 0), sellerMaxPrice);
  const myRevenue = Math.floor(finalPrice * 0.85);
  const fmtKRW = (n: number) => n.toLocaleString('ko-KR') + '원';

  // QR Scanner state
  const [showScanner, setShowScanner] = useState(false);

  // Bag edit state
  const [editingBagId, setEditingBagId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editClosing, setEditClosing] = useState('');

  const startEditBag = (b: { id: number; price: number; quantity: number; closingTime: string }) => {
    setEditingBagId(b.id);
    setEditPrice(String(b.price));
    setEditQty(String(b.quantity));
    setEditClosing(b.closingTime ? b.closingTime.slice(0, 16) : '');
  };

  const handleUpdateBag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBagId) return;
    updateBag({ id: editingBagId, data: {
      price: Number(editPrice),
      quantity: Number(editQty),
      closingTime: editClosing ? new Date(editClosing).toISOString() : undefined,
    }}, {
      onSuccess: () => {
        toast({ title: '✅ 수정 완료', description: '서프라이즈백이 수정되었습니다.' });
        setEditingBagId(null);
        refetchBags();
      },
      onError: (e) => toast({ title: '오류', description: e.message, variant: 'destructive' })
    });
  };
  const [pickupToken, setPickupToken] = useState('');

  const handleSaveStore = (e: React.FormEvent) => {
    e.preventDefault();
    createProfile({ data: {
      storeName, address,
      bankAccount: bankAccount || undefined,
      district: district || undefined,
      showContact,
      contactPhone: contactPhone.trim() || undefined,
    }}, {
      onSuccess: () => {
        toast({ title: '✅ 저장 완료', description: '매장 정보가 등록/수정되었습니다.' });
        refetchProfile();
        setTab('bags');
      },
      onError: (e) => toast({ title: '오류', description: e.message, variant: 'destructive' })
    });
  };

  const canSubmitBag = bagType === 'free'
    ? (Number(bagQty) >= 1 && !!bagClosing)
    : (Number(costPrice) > 0 && finalPrice > 0 && finalPrice <= sellerMaxPrice && Number(bagQty) >= 1 && !!bagClosing);

  const handleCreateBag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitBag) return;
    createBag({ data: { 
      type: bagType,
      originalPrice: bagType === 'paid' ? Number(costPrice) : 0,
      price: finalPrice,
      quantity: Number(bagQty), 
      closingTime: new Date(bagClosing).toISOString(),
      category: bagCategory,
      description: bagDescription.trim() || undefined,
    }}, {
      onSuccess: () => {
        toast({ title: '🚀 등록 완료', description: '서프라이즈백 판매가 시작되었습니다!' });
        refetchBags();
      },
      onError: (e) => toast({ title: '오류', description: e.message, variant: 'destructive' })
    });
  };

  const handleManualPickup = (e: React.FormEvent) => {
    e.preventDefault();
    confirmPickup({ data: { qrToken: pickupToken, method: 'button' } }, {
      onSuccess: (res) => {
        toast({ title: '✅ 픽업 확인!', description: res.message });
        setPickupToken('');
      },
      onError: (e) => toast({ title: '오류', description: e.message, variant: 'destructive' })
    });
  };

  const handleQrScan = (decodedText: string) => {
    setShowScanner(false);
    // QR 코드에서 토큰 추출 (URL 형식 또는 토큰 직접)
    let token = decodedText;
    try {
      const url = new URL(decodedText);
      const pathParts = url.pathname.split('/');
      token = pathParts[pathParts.length - 1] || decodedText;
    } catch { /* 순수 토큰 문자열 */ }

    confirmPickup({ data: { qrToken: token, method: 'qr' } }, {
      onSuccess: (res) => {
        toast({ title: '✅ QR 픽업 확인!', description: res.message });
      },
      onError: (e) => {
        toast({ title: 'QR 인식 실패', description: e.message, variant: 'destructive' });
        setShowScanner(true); // 실패 시 재시작
      }
    });
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-zen-bg flex items-center justify-center">
        <div className="text-zen-green font-semibold text-xl animate-pulse">로딩 중...</div>
      </div>
    );
  }

  const isApproved = profile?.approvalStatus === 'approved';

  return (
    <div className="min-h-screen bg-zen-bg">
      {/* Header */}
      <header className="bg-white border-b border-zen-border px-4 py-3.5 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div>
          <h1 className="text-base font-bold text-zen-text">라스트 히어로</h1>
          <p className="text-xs text-zen-muted">{profile?.storeName || '매장 미등록'} · 판매자</p>
        </div>
        <button onClick={onLogout} className="flex items-center text-sm font-semibold text-zen-sub hover:text-zen-red transition-colors gap-1.5 border border-zen-border rounded-lg px-3 py-1.5">
          <LogOut className="w-3.5 h-3.5" /> 로그아웃
        </button>
      </header>

      {/* Status Banners */}
      <div className="max-w-3xl mx-auto">
        {!profile?.storeName && (
          <div className="mx-4 mt-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-4">
            <h2 className="font-bold text-[15px] mb-1 text-[#92400E]">📝 매장 정보를 먼저 등록해주세요</h2>
            <p className="text-sm text-[#92400E]/80">아래 매장 관리 탭에서 매장명과 주소를 입력하세요.</p>
          </div>
        )}
        {profile && profile.approvalStatus === 'pending' && (
          <div className="mx-4 mt-4 bg-[#FFF7ED] border border-[#FED7AA] rounded-xl p-4">
            <h2 className="font-bold text-[15px] text-[#9A3412]">⏳ 관리자 승인 대기 중</h2>
            <p className="text-sm mt-1 text-[#9A3412]/80">승인 후 서프라이즈백 등록이 가능합니다.</p>
          </div>
        )}
        {profile && (profile as any).approvalStatus === 'suspended' && (
          <div className="mx-4 mt-4 bg-[#FFF1EE] border border-[#FECACA] rounded-xl p-4">
            <h2 className="font-bold text-[15px] text-[#C0392B]">⚠️ 이용 중지 상태</h2>
            <p className="text-sm mt-1 text-[#C0392B]/80">
              현재 계정이 일시 중지되어 서프라이즈백 등록 및 판매가 제한됩니다.
            </p>
            {(profile as any).suspendReason && (
              <p className="text-xs mt-2 bg-white/50 rounded-lg px-3 py-2 text-[#C0392B] font-medium">
                📋 사유: {(profile as any).suspendReason}
              </p>
            )}
            <p className="text-xs mt-2 text-[#C0392B]/60">문의: 관리자에게 연락하세요.</p>
          </div>
        )}
        {isApproved && profile?.storeName && (
          <div className="mx-4 mt-4 bg-zen-green-bg border border-[#BDD8C6] rounded-xl p-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-zen-green flex-shrink-0" />
            <p className="font-semibold text-sm text-zen-green">{profile.storeName} · 승인된 판매자</p>
          </div>
        )}

        {/* 판매자 공지 배너 */}
        {sellerNotices.length > 0 && (
          <div className="mx-4 mt-3 space-y-2">
            {sellerNotices.map(n => (
              <div key={n.id} className="bg-[#FFF7ED] border border-[#FED7AA] rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-black text-[#92400E]">📢 공지</span>
                </div>
                <p className="font-bold text-sm text-[#92400E] leading-tight">{n.title}</p>
                <p className="text-xs text-[#92400E]/80 mt-1 leading-relaxed whitespace-pre-wrap">{n.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 오늘의 장사 현황 요약 ── */}
      {isApproved && orders !== undefined && (
        <div className="max-w-3xl mx-auto px-4 mt-4">
          {(() => {
            const todayStart = startOfDay(new Date());
            const todayOrders = orders.filter(o =>
              isAfter(new Date(o.createdAt), todayStart) && o.pickupStatus !== 'no_show'
            );
            const todayQty = todayOrders.length;
            const todayRevenue = todayOrders.reduce((s, o) => s + (o.amount || 0), 0);
            const todayNet = Math.floor(todayRevenue * 0.85);
            return (
              <div className="bg-white border border-zen-border rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-[#1C1C1A] px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-white" />
                    <span className="font-bold text-sm text-white">오늘의 장사 현황</span>
                  </div>
                  <span className="text-xs text-white/50">{format(new Date(), 'M월 d일 (eee)', { locale: ko })}</span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-zen-border">
                  <div className="py-4 px-2 text-center">
                    <p className="text-2xl font-black text-zen-text">{todayQty}</p>
                    <p className="text-xs text-zen-sub mt-1 font-semibold">건 판매</p>
                  </div>
                  <div className="py-4 px-2 text-center">
                    <p className="text-xl font-black text-blue-600">{fmtKRWShort(todayRevenue)}</p>
                    <p className="text-xs text-blue-400 mt-1 font-semibold">총 매출</p>
                  </div>
                  <div className="py-4 px-2 text-center">
                    <p className="text-xl font-black text-zen-green">{fmtKRWShort(todayNet)}</p>
                    <p className="text-xs text-zen-green/70 mt-1 font-semibold">수수료 제외</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="max-w-3xl mx-auto mt-4">
        <div className="mx-4 flex bg-white border border-zen-border rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setTab('store')}
            className={cn("flex-1 py-3 font-semibold border-r border-zen-border transition-colors flex flex-col items-center gap-1 text-sm", tab === 'store' ? "bg-zen-green-bg text-zen-green" : "text-zen-sub hover:bg-zen-warm")}
          >
            <Store className="w-4 h-4" />
            매장 관리
          </button>
          <button
            onClick={() => setTab('bags')}
            className={cn("flex-1 py-3 font-semibold border-r border-zen-border transition-colors flex flex-col items-center gap-1 text-sm", tab === 'bags' ? "bg-zen-green-bg text-zen-green" : "text-zen-sub hover:bg-zen-warm")}
          >
            <ShoppingBag className="w-4 h-4" />
            백 관리
          </button>
          <button
            onClick={() => setTab('pickup')}
            className={cn("flex-1 py-3 font-semibold border-r border-zen-border transition-colors flex flex-col items-center gap-1 text-sm", tab === 'pickup' ? "bg-zen-green-bg text-zen-green" : "text-zen-sub hover:bg-zen-warm")}
          >
            <QrCode className="w-4 h-4" />
            픽업 확인
          </button>
          <button
            onClick={() => setTab('sales')}
            className={cn("flex-1 py-3 font-semibold transition-colors flex flex-col items-center gap-1 text-sm", tab === 'sales' ? "bg-zen-green-bg text-zen-green" : "text-zen-sub hover:bg-zen-warm")}
          >
            <BarChart2 className="w-4 h-4" />
            매출·정산
          </button>
        </div>

        {/* Tab Content */}
        <div className="mx-4 mt-3 mb-8 bg-white border border-zen-border rounded-xl p-6 shadow-sm">
          {/* ── 매장 관리 탭 ── */}
          {tab === 'store' && (
            <>
            <form onSubmit={handleSaveStore} className="space-y-4">
              <h2 className="text-xl font-bold text-zen-text mb-4 pb-3 border-b border-zen-border">기본 매장 정보</h2>
              <div>
                <NeoLabel className="mb-2 block">매장명 *</NeoLabel>
                <NeoInput 
                  value={storeName} 
                  onChange={e => setStoreName(e.target.value)} 
                  placeholder="홍길동 베이커리"
                  required 
                />
              </div>
              <div>
                <NeoLabel className="mb-2 block">주소 *</NeoLabel>
                <NeoInput 
                  value={address} 
                  onChange={e => setAddress(e.target.value)} 
                  placeholder="서울시 강남구 테헤란로 1번길"
                  required 
                />
              </div>
              <div>
                <NeoLabel className="mb-2 block">정산 계좌번호</NeoLabel>
                <NeoInput 
                  value={bankAccount} 
                  onChange={e => setBankAccount(e.target.value)} 
                  placeholder="국민은행 123-456-789012" 
                />
              </div>
              <div>
                <NeoLabel className="mb-2 block">📍 법정동 (내 동네 검색용)</NeoLabel>
                <input
                  list="district-list"
                  value={district}
                  onChange={e => setDistrict(e.target.value)}
                  className="w-full px-3 py-2.5 border-[1.5px] border-zen-border rounded-lg text-sm focus:outline-none focus:border-zen-green transition-colors bg-white"
                  placeholder="예: 역삼동, 봉담읍, 행궁동"
                />
                <datalist id="district-list">
                  {['강남구','서초구','마포구','종로구','용산구','성동구','송파구','강동구','노원구','은평구','강서구','양천구','구로구','관악구','동작구','영등포구','봉담읍','행궁동','수원시','성남시','고양시','용인시','부천시','안양시','해운대구','수영구','부산진구','대전 유성구','광주 서구','인천 서구'].map(d => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
                <p className="text-xs text-gray-500 mt-1 font-sans">고객이 '내 동네' 검색 시 이 지역의 상품이 먼저 뜹니다</p>
              </div>
              {/* ── 연락처 공개 설정 ── */}
              <div className="border border-zen-border rounded-xl overflow-hidden">
                <div className="bg-zen-warm px-4 py-3 border-b border-zen-border">
                  <p className="font-bold text-sm text-zen-text">📞 구매자 연락처 공개 설정</p>
                  <p className="text-xs text-zen-muted mt-0.5">고객 QR 확인 페이지에서 연락처를 공개할지 선택하세요.</p>
                </div>
                <div className="p-4 space-y-3">
                  {/* ON/OFF 토글 */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zen-text">연락처 공개</p>
                      <p className="text-xs text-zen-muted">{showContact ? '고객에게 전화번호가 표시됩니다' : '지도 보기 버튼만 제공됩니다'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowContact(prev => !prev)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${showContact ? 'bg-zen-green' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${showContact ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {/* 고객 응대용 매장 번호 */}
                  {showContact && (
                    <div>
                      <NeoLabel className="mb-1.5 block text-xs">고객 응대용 매장 번호 <span className="text-zen-muted font-normal">(비워두면 가입 번호 표시)</span></NeoLabel>
                      <NeoInput
                        type="tel"
                        value={contactPhone}
                        onChange={e => setContactPhone(e.target.value)}
                        placeholder="예: 02-1234-5678 또는 010-1234-5678"
                      />
                    </div>
                  )}
                </div>
              </div>

              <NeoButton type="submit" variant="primary" className="w-full py-4 text-lg mt-2" disabled={createProfilePending}>
                {createProfilePending ? '저장 중...' : '판매자 등록 / 수정 저장'}
              </NeoButton>
            </form>

            {/* ── 비밀번호 변경 ── */}
            <div className="mt-8 pt-6 border-t border-zen-border">
              <h3 className="text-base font-bold text-zen-text mb-1 flex items-center gap-2">
                🔑 비밀번호 변경
              </h3>
              <p className="text-xs text-zen-muted mb-4">초기 비밀번호 <code className="bg-zen-green-bg text-zen-green font-bold px-1 rounded">0000</code>을 본인만 아는 번호로 변경할 수 있습니다. (4자리 이상)</p>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div>
                  <NeoLabel className="mb-1.5 block text-sm">현재 비밀번호</NeoLabel>
                  <div className="relative">
                    <NeoInput
                      type={showCurrentPw ? 'text' : 'password'}
                      inputMode="numeric"
                      value={currentPw}
                      onChange={e => setCurrentPw(e.target.value)}
                      placeholder="현재 비밀번호"
                      required
                    />
                    <button type="button" onClick={() => setShowCurrentPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zen-muted hover:text-zen-green font-medium">
                      {showCurrentPw ? '숨기기' : '보기'}
                    </button>
                  </div>
                </div>
                <div>
                  <NeoLabel className="mb-1.5 block text-sm">새 비밀번호</NeoLabel>
                  <div className="relative">
                    <NeoInput
                      type={showNewPw ? 'text' : 'password'}
                      inputMode="numeric"
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                      placeholder="새 비밀번호 (4자리 이상)"
                      required
                    />
                    <button type="button" onClick={() => setShowNewPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zen-muted hover:text-zen-green font-medium">
                      {showNewPw ? '숨기기' : '보기'}
                    </button>
                  </div>
                </div>
                <div>
                  <NeoLabel className="mb-1.5 block text-sm">새 비밀번호 확인</NeoLabel>
                  <NeoInput
                    type="password"
                    inputMode="numeric"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    placeholder="새 비밀번호 다시 입력"
                    required
                  />
                  {confirmPw && newPw !== confirmPw && (
                    <p className="text-xs text-zen-red mt-1 font-medium">비밀번호가 일치하지 않습니다</p>
                  )}
                </div>
                <NeoButton
                  type="submit"
                  variant="secondary"
                  className="w-full py-3"
                  disabled={changePwLoading || (!!confirmPw && newPw !== confirmPw)}
                >
                  {changePwLoading ? '변경 중...' : '비밀번호 변경'}
                </NeoButton>
              </form>
            </div>
            </>
          )}

          {/* ── 백 관리 탭 ── */}
          {tab === 'bags' && (
            <div>
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-zen-border">
                <h2 className="text-xl font-bold text-zen-text">서프라이즈백 관리</h2>
                <button onClick={() => refetchBags()} className="p-2 border border-zen-border rounded-lg hover:bg-zen-warm hover:border-zen-green transition-colors">
                  <RefreshCw className="w-4 h-4 text-zen-sub" />
                </button>
              </div>

              {!isApproved && (
                <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-xl p-4 mb-5">
                  <p className="font-semibold text-sm text-[#9A3412]">⚠️ 승인된 판매자만 서프라이즈백을 등록할 수 있습니다.</p>
                  <p className="text-xs mt-1 text-[#9A3412]/70">관리자 승인 후 이용해주세요. 테스트 계정(0000)은 자동 승인됩니다.</p>
                </div>
              )}

              {/* 등록 폼 */}
              <div className="bg-zen-warm border border-zen-border rounded-xl p-4 mb-5">
                <h3 className="font-bold text-base mb-4 flex items-center gap-1.5 text-zen-text">
                  <Plus className="w-4 h-4" /> 새 서프라이즈백 등록
                </h3>
                <form onSubmit={handleCreateBag} className="space-y-5">

                  {/* ── 유형 선택 (대형 Zen 버튼) ── */}
                  <div>
                    <NeoLabel className="mb-2 block font-bold">판매 유형</NeoLabel>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setBagType('paid')}
                        className={cn(
                          "py-5 rounded-xl border-2 font-bold text-base transition-all duration-150 flex flex-col items-center gap-1.5",
                          bagType === 'paid'
                            ? 'border-[#4D7C5F] bg-[#4D7C5F] text-white shadow-md'
                            : 'border-[#E8E6E1] bg-white text-[#6B6962] hover:border-[#4D7C5F]'
                        )}
                      >
                        <span className="text-2xl">💰</span>
                        <span className="font-black tracking-tight">유료 할인백</span>
                        <span className="text-xs opacity-70 font-normal">최대 10,000원</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBagType('free')}
                        className={cn(
                          "py-5 rounded-xl border-2 font-bold text-base transition-all duration-150 flex flex-col items-center gap-1.5",
                          bagType === 'free'
                            ? 'border-[#4D7C5F] bg-[#EEF4F0] text-[#4D7C5F] shadow-md'
                            : 'border-[#E8E6E1] bg-white text-[#6B6962] hover:border-[#4D7C5F]'
                        )}
                      >
                        <span className="text-2xl">🌱</span>
                        <span className="font-black tracking-tight">무료 나눔백</span>
                        <span className="text-xs opacity-70 font-normal">0원 · 무료 나눔</span>
                      </button>
                    </div>
                  </div>

                  {/* ── 대분류 선택 ── */}
                  <div>
                    <NeoLabel className="mb-2 block font-bold">대분류 <span className="text-zen-sub font-normal text-xs">— 카테고리를 선택하면 기본 이미지가 표시됩니다</span></NeoLabel>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {BAG_CATEGORIES.map(cat => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setBagCategory(cat.value)}
                          className={cn(
                            "py-3 rounded-xl border-2 font-bold text-xs transition-all duration-150 flex flex-col items-center gap-1",
                            bagCategory === cat.value
                              ? 'border-[#4D7C5F] bg-[#4D7C5F] text-white shadow-md'
                              : 'border-[#E8E6E1] bg-white text-[#6B6962] hover:border-[#4D7C5F]'
                          )}
                        >
                          <span className="text-lg">{cat.emoji}</span>
                          <span>{cat.label}</span>
                        </button>
                      ))}
                    </div>
                    {/* 카테고리 이미지 미리보기 */}
                    {(() => {
                      const sel = BAG_CATEGORIES.find(c => c.value === bagCategory);
                      if (!sel) return null;
                      return (
                        <div className="rounded-xl overflow-hidden border border-zen-border bg-zen-warm relative">
                          <img
                            src={`${import.meta.env.BASE_URL}images/${sel.image}`}
                            alt={sel.label}
                            className="w-full h-40 object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <div className="absolute bottom-3 left-3">
                            <span className="bg-white/90 text-zen-green text-xs font-black px-2.5 py-1 rounded-full shadow">
                              {sel.emoji} {sel.label} 기본 이미지
                            </span>
                          </div>
                          <div className="absolute top-2 right-2">
                            <span className="bg-zen-green text-white text-[10px] font-bold px-2 py-0.5 rounded-full">미리보기</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── 상세 설명 (선택) ── */}
                  <div>
                    <NeoLabel className="mb-2 block font-bold">
                      오늘의 구성 <span className="text-zen-sub font-normal text-xs">— 선택 입력 (비우면 기본 문구 노출)</span>
                    </NeoLabel>
                    <textarea
                      value={bagDescription}
                      onChange={e => setBagDescription(e.target.value)}
                      placeholder="예: 오늘은 단팥빵 3개, 소보로 2개, 크림빵 1개 구성입니다 🍞"
                      rows={3}
                      maxLength={200}
                      className="w-full px-4 py-3 border-[1.5px] border-zen-border rounded-xl text-sm text-zen-text focus:outline-none focus:border-[#4D7C5F] bg-white transition-colors resize-none leading-relaxed placeholder:text-zen-muted"
                    />
                    <p className="text-[11px] text-zen-muted mt-1 text-right">{bagDescription.length}/200</p>
                  </div>

                  {/* ── 판매자별 최대 등록금액 안내 ── */}
                  {bagType === 'paid' && profile && (
                    <div className="bg-zen-green-bg border border-[#BDD8C6] rounded-xl px-4 py-3 flex items-center gap-3">
                      <span className="text-xl flex-shrink-0">💰</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zen-green leading-snug">
                          {profile.storeName ? `${profile.storeName.split(' ')[0]} ` : ''}대표님은 현재 최대{' '}
                          <span className="text-base underline">{sellerMaxPrice.toLocaleString()}원</span>까지 등록 가능합니다
                        </p>
                        <p className="text-xs text-[#3D6B4F] mt-0.5">판매가가 이 금액을 초과하면 자동으로 조정됩니다.</p>
                      </div>
                    </div>
                  )}

                  {/* ── 유료 전용: 원가 + 할인율 + 실시간 계산 ── */}
                  {bagType === 'paid' && (
                    <div className="space-y-4">
                      {/* 원가 입력 */}
                      <div>
                        <NeoLabel className="mb-1.5 block font-bold">
                          원가 (정가) <span className="text-zen-sub font-normal text-xs">— 할인 전 실제 가격</span>
                        </NeoLabel>
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="100000"
                            value={costPrice}
                            onChange={e => setCostPrice(e.target.value)}
                            placeholder="예: 10000"
                            required
                            className="w-full px-4 py-3 pr-10 border-[1.5px] border-zen-border rounded-xl text-base font-bold text-zen-text focus:outline-none focus:border-[#4D7C5F] bg-white transition-colors"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-zen-sub">원</span>
                        </div>
                      </div>

                      {/* 할인율 프리셋 버튼 */}
                      <div>
                        <NeoLabel className="mb-2 block font-bold">
                          할인율 <span className="text-zen-sub font-normal text-xs">— 프리셋 선택 또는 직접 입력</span>
                        </NeoLabel>
                        <div className="grid grid-cols-5 gap-2 mb-2">
                          {[30, 40, 50, 60, 70].map(rate => (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => { setDiscountRate(rate); setUseCustomRate(false); setCustomRate(''); }}
                              className={cn(
                                "py-2.5 rounded-lg border-2 text-sm font-black transition-all duration-100",
                                !useCustomRate && discountRate === rate
                                  ? 'border-[#4D7C5F] bg-[#4D7C5F] text-white'
                                  : 'border-[#E8E6E1] bg-white text-[#6B6962] hover:border-[#4D7C5F] hover:text-[#4D7C5F]'
                              )}
                            >
                              {rate}%
                            </button>
                          ))}
                        </div>
                        {/* 직접 입력 */}
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="99"
                            value={customRate}
                            onChange={e => { setCustomRate(e.target.value); setUseCustomRate(true); }}
                            onFocus={() => setUseCustomRate(true)}
                            placeholder="직접 입력 (예: 35)"
                            className={cn(
                              "w-full px-4 py-2.5 pr-10 border-[1.5px] rounded-xl text-sm font-semibold text-zen-text focus:outline-none transition-colors bg-white",
                              useCustomRate ? 'border-[#4D7C5F]' : 'border-zen-border'
                            )}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-zen-sub">%</span>
                        </div>
                      </div>

                      {/* 실시간 가격 계산 카드 */}
                      <div className="bg-white border-2 border-[#4D7C5F] rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-[#4D7C5F] px-4 py-2.5 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-white" />
                          <span className="font-bold text-sm text-white">실시간 수익 계산</span>
                          <span className="ml-auto text-xs text-white/70 font-medium">할인율 {effectiveRate}% 적용</span>
                        </div>
                        <div className="px-4 py-4 space-y-2.5">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-[#6B6962]">원가</span>
                            <span className="font-semibold text-[#1C1C1A] text-sm line-through opacity-60">
                              {fmtKRW(Number(costPrice) || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-[#6B6962]">할인율</span>
                            <span className="font-bold text-[#C0392B] text-sm">-{effectiveRate}%</span>
                          </div>
                          <div className="border-t border-[#E8E6E1] pt-2.5 flex justify-between items-center">
                            <span className="text-base font-black text-[#1C1C1A]">판매가</span>
                            <span className="text-xl font-black text-[#4D7C5F]">{fmtKRW(finalPrice)}</span>
                          </div>
                          {finalPrice >= sellerMaxPrice && (
                            <p className="text-xs text-[#C0392B] font-semibold">⚠️ 상한가 {sellerMaxPrice.toLocaleString()}원으로 자동 조정됩니다</p>
                          )}
                          <div className="bg-[#EEF4F0] rounded-lg px-3 py-2.5 flex justify-between items-center">
                            <div>
                              <p className="text-xs text-[#4D7C5F] font-semibold">정산 예정액</p>
                              <p className="text-xs text-[#6B6962] mt-0.5">수수료 15% 제외 후</p>
                            </div>
                            <span className="text-lg font-black text-[#4D7C5F]">{fmtKRW(myRevenue)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-[#6B6962]">
                            <div className="flex justify-between">
                              <span>플랫폼 수수료 12%</span>
                              <span className="font-semibold">-{fmtKRW(Math.floor(finalPrice * 0.12))}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>PG사 수수료 3%</span>
                              <span className="font-semibold">-{fmtKRW(Math.floor(finalPrice * 0.03))}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 무료 안내 */}
                  {bagType === 'free' && (
                    <div className="bg-[#EEF4F0] border border-[#BDD8C6] rounded-xl px-4 py-3.5 flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">🌱</span>
                      <div>
                        <p className="font-bold text-sm text-[#4D7C5F]">무료 나눔 모드</p>
                        <p className="text-xs text-[#6B6962] mt-0.5 leading-relaxed">
                          판매가: <strong>0원</strong> · 수수료 없음 · 정산 없음<br />
                          음식을 기부하고 지구를 구하는 히어로가 됩니다! 🌍
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 수량 + 마감 시간 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <NeoLabel className="mb-1.5 block font-bold">수량 (개)</NeoLabel>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="99"
                        value={bagQty}
                        onChange={e => setBagQty(e.target.value)}
                        required
                        className="w-full px-4 py-3 border-[1.5px] border-zen-border rounded-xl text-base font-bold text-zen-text focus:outline-none focus:border-[#4D7C5F] bg-white transition-colors text-center"
                      />
                    </div>
                    <div>
                      <NeoLabel className="mb-1.5 block font-bold">픽업 마감</NeoLabel>
                      <NeoInput type="datetime-local" value={bagClosing} onChange={e => setBagClosing(e.target.value)} required />
                    </div>
                  </div>

                  <NeoButton
                    type="submit"
                    variant="primary"
                    className="w-full text-base py-4 font-black"
                    disabled={createBagPending || !isApproved || !canSubmitBag}
                  >
                    {createBagPending
                      ? '등록 중...'
                      : !canSubmitBag && bagType === 'paid'
                        ? '원가와 마감 시간을 입력해주세요'
                        : bagType === 'free'
                          ? '🌱 무료 나눔 시작'
                          : `🚀 판매 시작 · ${fmtKRW(finalPrice)}`}
                  </NeoButton>
                </form>
              </div>

              {/* 무료백 현황 (오늘 날짜 기준) */}
              {(() => {
                const todayStart = new Date(); todayStart.setHours(0,0,0,0);
                const todayFreeBags = bags?.filter(b => b.type === 'free' && new Date(b.closingTime) >= todayStart) ?? [];
                return todayFreeBags.length > 0 ? (
                  <div className="bg-zen-green-bg border border-[#BDD8C6] rounded-xl p-4 mb-5">
                    <h3 className="font-bold text-sm text-zen-green mb-3 flex items-center gap-1.5">🌱 오늘의 무료 나눔 현황</h3>
                    {todayFreeBags.map(b => (
                      <div key={b.id} className="flex justify-between items-center">
                        <span className="text-sm text-zen-text font-medium">총 {b.quantity}개 중</span>
                        <div className="text-right">
                          <span className="font-bold text-zen-green">{b.remainingQuantity}개 남음</span>
                          <span className="text-xs text-zen-sub ml-2">({b.quantity - b.remainingQuantity}명 선착순)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* 매출·정산 탭 안내 */}
              <button
                onClick={() => setTab('sales')}
                className="w-full flex items-center justify-between bg-zen-green-bg border border-[#BDD8C6] rounded-xl px-4 py-3 mb-5 hover:bg-[#DFF0E5] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <BarChart2 className="w-4 h-4 text-zen-green" />
                  <div className="text-left">
                    <p className="font-bold text-sm text-zen-green">매출·정산 조회</p>
                    <p className="text-xs text-zen-green/70 mt-0.5">기간별 매출 · 이번 주 정산 예정액 확인</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zen-green" />
              </button>

              {/* 백 목록 */}
              <h3 className="font-bold text-base text-zen-text mb-3">현재 판매 내역</h3>
              {bags?.length === 0 && <p className="text-zen-muted text-sm">등록된 서프라이즈백이 없습니다.</p>}
              <div className="space-y-2.5">
                {bags?.map(b => {
                  const isExpiredByTime = new Date(b.closingTime) < new Date();
                  const effectiveClosed = b.status === 'closed' || b.status === 'soldout' || isExpiredByTime;
                  const displayStatus = isExpiredByTime && b.status === 'active' ? 'closed' : b.status;
                  return (
                  <div key={b.id} className={cn("border rounded-xl shadow-sm overflow-hidden transition-all", effectiveClosed ? 'bg-[#F8F8F6] border-[#E0DEDA] opacity-75 grayscale-[40%]' : 'bg-white border-zen-border')}>
                    <div className="p-4 flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <NeoBadge variant={b.type === 'free' ? 'primary' : 'secondary'}>{b.type === 'free' ? '무료' : '유료'}</NeoBadge>
                          <span className="font-bold text-lg text-zen-text">{b.price === 0 ? '무료' : `${b.price.toLocaleString('ko-KR')}원`}</span>
                        </div>
                        <p className="text-sm text-zen-sub">잔여: <span className={cn("font-bold", b.remainingQuantity > 0 ? 'text-zen-green' : 'text-zen-muted')}>{b.remainingQuantity}</span> / {b.quantity}개</p>
                        <p className="text-xs text-zen-muted mt-0.5">마감: {format(new Date(b.closingTime), 'M/d HH:mm', { locale: ko })}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={cn("px-2.5 py-1 text-xs font-semibold rounded-full",
                          displayStatus === 'active' ? 'bg-zen-green-bg text-zen-green'
                          : displayStatus === 'soldout' ? 'bg-[#FDF2F1] text-[#C0392B]'
                          : 'bg-zen-warm text-zen-muted'
                        )}>
                          {displayStatus === 'active' ? '● LIVE' : displayStatus === 'closed' ? '● 마감' : '완판'}
                        </span>
                        <div className="flex flex-col items-end gap-1.5">
                          {/* 수정 버튼: LIVE 상태는 항상, 마감/완판은 재출시 목적으로 */}
                          <button
                            onClick={() => editingBagId === b.id ? setEditingBagId(null) : startEditBag(b)}
                            className={cn("text-xs font-medium transition-colors",
                              effectiveClosed
                                ? 'text-[#4D7C5F] hover:text-[#3a6349] underline underline-offset-2'
                                : 'text-zen-sub hover:text-zen-green'
                            )}
                          >
                            {editingBagId === b.id ? '취소' : effectiveClosed ? '수정 후 재출시' : '수정'}
                          </button>
                          {/* 오늘 마감 버튼: LIVE 상태만 */}
                          {!effectiveClosed && (
                            <button
                              onClick={() => {
                                if (!window.confirm('오늘 영업을 마감할까요?\n재고가 남아도 손님 화면에서 즉시 사라집니다.')) return;
                                updateBag({ id: b.id, data: { status: 'closed' } }, {
                                  onSuccess: () => {
                                    toast({ title: '🔒 영업 마감', description: '오늘 영업이 마감되었습니다.' });
                                    refetchBags();
                                  },
                                  onError: (e) => toast({ title: '오류', description: e.message, variant: 'destructive' })
                                });
                              }}
                              className="text-[11px] bg-[#FDF2F1] text-[#C0392B] border border-[#F5C6C2] px-2.5 py-1 rounded-lg font-bold hover:bg-[#C0392B] hover:text-white transition-colors"
                            >
                              🔒 오늘 마감
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 인라인 수정 폼 */}
                    {editingBagId === b.id && (
                      <form onSubmit={handleUpdateBag} className="border-t border-zen-border bg-zen-warm p-3 space-y-2.5">
                        {effectiveClosed && (
                          <p className="text-xs text-[#4D7C5F] font-semibold bg-[#EEF4F0] border border-[#BDD8C6] rounded-lg px-3 py-2">
                            💡 마감 시간을 미래로 변경하면 자동으로 LIVE 재출시됩니다
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <NeoLabel className="text-xs mb-1 block">가격 (원)</NeoLabel>
                            <NeoInput
                              type="number"
                              inputMode="numeric"
                              value={editPrice}
                              onChange={e => setEditPrice(e.target.value)}
                              min={b.type === 'free' ? '0' : '1000'}
                              max="10000"
                              disabled={b.type === 'free'}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <NeoLabel className="text-xs mb-1 block">수량</NeoLabel>
                            <NeoInput
                              type="number"
                              inputMode="numeric"
                              value={editQty}
                              onChange={e => setEditQty(e.target.value)}
                              min="1"
                              max="50"
                              className="text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <NeoLabel className="text-xs mb-1 block">마감 시간</NeoLabel>
                          <NeoInput
                            type="datetime-local"
                            value={editClosing}
                            onChange={e => setEditClosing(e.target.value)}
                            className="text-sm w-full"
                          />
                        </div>
                        <NeoButton type="submit" variant="primary" className="w-full text-sm py-2" disabled={updateBagPending}>
                          {updateBagPending ? '저장 중...' : effectiveClosed ? '재출시' : '변경 사항 저장'}
                        </NeoButton>
                      </form>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 픽업 확인 탭 ── */}
          {tab === 'pickup' && (
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-zen-border">
                <h2 className="text-xl font-bold text-zen-text">픽업 확인</h2>
                <button onClick={() => refetchOrders()} className="p-2 border border-zen-border rounded-lg hover:bg-zen-warm transition-colors">
                  <RefreshCw className="w-4 h-4 text-zen-sub" />
                </button>
              </div>

              {/* ── 오늘 주문 리스트 ── */}
              {(() => {
                const todayStart = startOfDay(new Date());
                const todayOrders = (orders || []).filter(o => isAfter(new Date(o.createdAt), todayStart));
                const pending = todayOrders.filter(o => o.pickupStatus === 'pending');
                const done = todayOrders.filter(o => o.pickupStatus !== 'pending');
                return (
                  <div className="mb-6">
                    {todayOrders.length === 0 ? (
                      <div className="text-center py-8 text-zen-muted text-sm">
                        <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        오늘 접수된 주문이 없습니다
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {pending.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" /> 픽업 대기 {pending.length}건
                            </p>
                            <div className="space-y-2">
                              {pending.map(o => (
                                <div key={o.id} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-bold text-sm text-zen-text truncate">{o.customerName || '고객'}</p>
                                    <p className="text-xs text-zen-sub mt-0.5">
                                      {format(new Date(o.createdAt), 'HH:mm')} · {o.amount > 0 ? `${o.amount.toLocaleString()}원` : '무료'}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => confirmPickup({ data: { qrToken: o.qrToken, method: 'button' } }, {
                                      onSuccess: () => { toast({ title: '✅ 픽업 완료 처리' }); refetchOrders(); },
                                      onError: (e: Error) => toast({ title: '오류', description: e.message, variant: 'destructive' })
                                    })}
                                    disabled={confirmPending}
                                    className="flex-shrink-0 px-4 py-2 bg-zen-green text-white text-xs font-bold rounded-lg hover:bg-[#3D6B4F] transition-colors disabled:opacity-50"
                                  >
                                    픽업 완료
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {done.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-zen-green bg-zen-green-bg border border-[#BDD8C6] rounded-lg px-3 py-1.5 mb-2">
                              ✅ 완료 {done.length}건
                            </p>
                            <div className="space-y-1.5">
                              {done.slice(0, 10).map(o => (
                                <div key={o.id} className="bg-zen-warm border border-zen-border rounded-xl px-4 py-2.5 flex items-center justify-between opacity-70">
                                  <div>
                                    <p className="font-semibold text-sm text-zen-text">{o.customerName || '고객'}</p>
                                    <p className="text-xs text-zen-muted">{format(new Date(o.createdAt), 'HH:mm')} · {o.amount > 0 ? `${o.amount.toLocaleString()}원` : '무료'}</p>
                                  </div>
                                  <span className="text-xs font-bold text-zen-green">완료</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="border-t border-zen-border pt-5 mb-4">
                <p className="text-sm font-bold text-zen-text mb-3">QR 스캔으로 픽업 확인</p>
              </div>

              {/* QR 스캐너 */}
              <div className="mb-5">
                {!showScanner ? (
                  <button
                    onClick={() => setShowScanner(true)}
                    className="w-full py-8 border-2 border-dashed border-zen-border rounded-xl flex flex-col items-center gap-3 hover:border-zen-green hover:bg-zen-green-bg transition-colors group"
                  >
                    <Camera className="w-12 h-12 text-zen-muted group-hover:text-zen-green transition-colors" />
                    <div>
                      <p className="font-semibold text-zen-text">카메라로 QR 스캔</p>
                      <p className="text-xs text-zen-muted mt-0.5">버튼을 누르면 카메라가 활성화됩니다</p>
                    </div>
                  </button>
                ) : (
                  <div className="rounded-xl overflow-hidden border border-zen-border">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-zen-green text-white">
                      <span className="text-sm font-semibold flex items-center gap-1.5">
                        <Camera className="w-4 h-4" /> QR 스캔 중...
                      </span>
                      <button
                        onClick={() => setShowScanner(false)}
                        className="text-white/70 hover:text-white text-xs font-medium flex items-center gap-1"
                      >
                        <CameraOff className="w-3.5 h-3.5" /> 닫기
                      </button>
                    </div>
                    <div className="p-3 bg-black">
                      <QrScanner
                        onScan={handleQrScan}
                        onError={() => toast({ title: '카메라 오류', description: '카메라 권한을 허용해주세요.', variant: 'destructive' })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-zen-border" />
                <span className="text-xs font-medium text-zen-muted">또는 토큰 직접 입력</span>
                <div className="flex-1 h-px bg-zen-border" />
              </div>

              <form onSubmit={handleManualPickup} className="flex gap-2">
                <NeoInput
                  placeholder="QR 토큰 (예: be994af3-...)"
                  value={pickupToken}
                  onChange={e => setPickupToken(e.target.value)}
                  className="flex-1"
                  required
                />
                <NeoButton type="submit" variant="primary" disabled={confirmPending}>
                  {confirmPending ? '...' : '픽업 확인'}
                </NeoButton>
              </form>

              <p className="text-xs text-zen-muted text-center mt-3">
                <QrCode className="w-3.5 h-3.5 inline mr-1" />
                고객의 QR 화면에 표시된 토큰을 직접 입력하거나 카메라로 스캔하세요
              </p>
            </div>
          )}

          {/* ── 매출·정산 탭 ── */}
          {tab === 'sales' && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-zen-text pb-3 border-b border-zen-border">매출·정산</h2>

              {/* 기간 선택 */}
              <div className="flex gap-2">
                {([
                  { key: 'today',     label: '오늘'    },
                  { key: 'yesterday', label: '어제'    },
                  { key: 'week',      label: '이번 주' },
                  { key: 'month',     label: '이번 달' },
                ] as const).map(p => (
                  <button
                    key={p.key}
                    onClick={() => setSalesPeriod(p.key)}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold rounded-lg border transition-colors",
                      salesPeriod === p.key
                        ? "bg-zen-green text-white border-zen-green"
                        : "bg-white text-zen-sub border-zen-border hover:border-zen-green"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* 기간별 매출 통계 */}
              {(() => {
                const now = new Date();
                const ranges: Record<typeof salesPeriod, { start: Date; end: Date; label: string }> = {
                  today:     { start: startOfDay(now),             end: endOfDay(now),             label: format(now, 'M월 d일') },
                  yesterday: { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)), label: format(subDays(now, 1), 'M월 d일') },
                  week:      { start: startOfWeek(now, { weekStartsOn: 1 }), end: now,            label: '이번 주' },
                  month:     { start: startOfMonth(now),           end: endOfMonth(now),           label: format(now, 'M월') },
                };
                const { start, end, label } = ranges[salesPeriod];
                const periodOrders = (orders || []).filter(o => {
                  const d = new Date(o.createdAt);
                  return d >= start && d <= end && o.pickupStatus !== 'no_show';
                });
                const totalRevenue = periodOrders.reduce((s, o) => s + (o.amount || 0), 0);
                const platformFee  = Math.floor(totalRevenue * 0.12);
                const pgFee        = Math.floor(totalRevenue * 0.03);
                const payout       = totalRevenue - platformFee - pgFee;
                const freeCount    = periodOrders.filter(o => o.amount === 0).length;
                const paidCount    = periodOrders.filter(o => o.amount > 0).length;
                return (
                  <div className="bg-white border border-zen-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-zen-warm border-b border-zen-border flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-zen-sub" />
                      <span className="font-bold text-sm text-zen-text">{label} 매출 현황</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zen-warm rounded-xl p-3 text-center">
                          <p className="text-2xl font-black text-zen-text">{periodOrders.length}</p>
                          <p className="text-xs text-zen-sub mt-0.5">총 주문</p>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-3 text-center">
                          <p className="text-xl font-black text-blue-700">{fmtKRWShort(totalRevenue)}</p>
                          <p className="text-xs text-blue-400 mt-0.5">총 매출액</p>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm pt-1">
                        <div className="flex justify-between text-zen-muted text-xs">
                          <span>유료 {paidCount}건 / 무료 {freeCount}건</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zen-sub">플랫폼 수수료 (12%)</span>
                          <span className="text-zen-muted">-{platformFee.toLocaleString('ko-KR')}원</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zen-sub">PG 수수료 (3%)</span>
                          <span className="text-zen-muted">-{pgFee.toLocaleString('ko-KR')}원</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-zen-border">
                          <span className="font-bold text-zen-text">실수령 예정액</span>
                          <span className="font-black text-zen-green text-base">{fmtKRWShort(payout)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 이번 주 정산 예정액 */}
              {(() => {
                const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
                const weekOrders = (orders || []).filter(o =>
                  isAfter(new Date(o.createdAt), weekStart) && o.pickupStatus !== 'no_show'
                );
                const weekRevenue = weekOrders.reduce((s, o) => s + (o.amount || 0), 0);
                const weekPayout  = Math.floor(weekRevenue * 0.85);
                const nextMonday  = new Date(weekStart); nextMonday.setDate(nextMonday.getDate() + 7);
                return (
                  <div className="bg-zen-green-bg border-2 border-[#BDD8C6] rounded-2xl overflow-hidden">
                    <div className="bg-zen-green px-4 py-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-white" />
                      <span className="font-bold text-sm text-white">이번 주 정산 예정액</span>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-3xl font-black text-zen-green mb-1">{fmtKRWShort(weekPayout)}</p>
                      <p className="text-xs text-zen-green/70">{weekOrders.length}건 · 수수료(15%) 제외</p>
                    </div>
                  </div>
                );
              })()}

              {/* 자동 정산 안내 */}
              <div className="bg-[#FFFBEB] border-2 border-[#FDE68A] rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">📅</span>
                  <div>
                    <p className="font-black text-[15px] text-[#92400E] mb-1">정산은 매주 월요일 자동 처리</p>
                    <p className="text-sm text-[#92400E]/80 leading-relaxed">
                      별도 신청 불필요 · 전주 월~일 매출을 매주 월요일에 자동 정산하여
                      등록된 계좌로 입금합니다.
                    </p>
                    <div className="mt-3 bg-white/70 rounded-xl px-3 py-2.5 border border-[#FDE68A]">
                      <p className="text-xs font-semibold text-[#92400E]">
                        💡 입금 계좌 변경은 <strong>매장 관리</strong> 탭 → 정산 계좌번호에서 수정하세요
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 주문 내역 (기간별) */}
              {(() => {
                const now = new Date();
                const ranges: Record<typeof salesPeriod, { start: Date; end: Date }> = {
                  today:     { start: startOfDay(now),             end: endOfDay(now)             },
                  yesterday: { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) },
                  week:      { start: startOfWeek(now, { weekStartsOn: 1 }), end: now             },
                  month:     { start: startOfMonth(now),           end: endOfMonth(now)           },
                };
                const { start, end } = ranges[salesPeriod];
                const periodOrders = (orders || []).filter(o => {
                  const d = new Date(o.createdAt);
                  return d >= start && d <= end;
                });
                if (periodOrders.length === 0) return null;
                return (
                  <div>
                    <h3 className="font-bold text-sm text-zen-text mb-2">주문 상세 내역</h3>
                    <div className="space-y-1.5">
                      {periodOrders.map(o => (
                        <div key={o.id} className="bg-zen-warm border border-zen-border rounded-xl px-4 py-2.5 flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm text-zen-text">{o.customerName || '고객'}</p>
                            <p className="text-xs text-zen-muted">{format(new Date(o.createdAt), 'M/d HH:mm')}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-sm text-zen-text">{o.amount > 0 ? `${o.amount.toLocaleString()}원` : '무료'}</p>
                            <p className={cn("text-xs font-semibold", o.pickupStatus === 'picked_up' || o.pickupStatus === 'completed' ? 'text-zen-green' : o.pickupStatus === 'no_show' ? 'text-[#C0392B]' : 'text-amber-600')}>
                              {o.pickupStatus === 'picked_up' || o.pickupStatus === 'completed' ? '완료' : o.pickupStatus === 'no_show' ? '노쇼' : '대기'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SellerPage() {
  const [token, setToken] = useState(typeof window !== 'undefined' ? localStorage.getItem('seller_token') : null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  const handleLogin = (newToken: string, phone: string) => {
    localStorage.setItem('seller_token', newToken);
    if (getSellerTermsAgreed(phone)) {
      setToken(newToken);
    } else {
      setPendingToken(newToken);
      setPendingPhone(phone);
    }
  };

  const handleTermsAgree = () => {
    if (!pendingPhone || !pendingToken) return;
    setSellerTermsAgreed(pendingPhone);
    setToken(pendingToken);
    setPendingPhone(null);
    setPendingToken(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('seller_token');
    setToken(null);
    setPendingPhone(null);
    setPendingToken(null);
  };

  if (pendingToken && pendingPhone) {
    return <SellerTermsModal onAgree={handleTermsAgree} />;
  }
  if (!token) return <SellerAuth onLogin={handleLogin} />;
  return <SellerDashboard token={token} onLogout={handleLogout} />;
}
