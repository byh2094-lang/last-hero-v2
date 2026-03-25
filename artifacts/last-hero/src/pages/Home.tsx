import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useListBags, getListBagsQueryKey } from '@workspace/api-client-react';
import type { ListBagsParams } from '@workspace/api-client-react';
import { NeoButton, NeoCard, NeoContainer } from '@/components/NeoUI';
import { MapPin, Clock, Leaf, AlertCircle, Navigation, ChevronDown, X, TrendingUp, LocateFixed, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getValidTickets, expireStaleTickets } from '@/lib/tickets';

// ─── 카테고리 이미지/이모지 매핑 ─────────────────────────────────────────────────
const CATEGORY_META: Record<string, { emoji: string; label: string; image: string }> = {
  '빵/베이커리':      { emoji: '🥐', label: '#빵/베이커리',      image: 'cat-bread.png'   },
  '떡/한과':         { emoji: '🍡', label: '#떡/한과',          image: 'cat-tteok.png'   },
  '반찬/밀키트':     { emoji: '🥘', label: '#반찬/밀키트',      image: 'cat-banchan.png' },
  '닭강정/치킨':     { emoji: '🍗', label: '#닭강정/치킨',      image: 'cat-chicken.png' },
  '분식/타코야끼':   { emoji: '🍢', label: '#분식/타코야끼',    image: 'cat-bunsik.png'  },
  '도시락/컵밥':     { emoji: '🍱', label: '#도시락/컵밥',      image: 'cat-dosirak.png' },
  '족발/보쌈':       { emoji: '🥩', label: '#족발/보쌈',        image: 'cat-jokbal.png'  },
  '카페/디저트/마카롱': { emoji: '☕', label: '#카페/디저트',   image: 'cat-dessert.png' },
  '기타/서프라이즈': { emoji: '🎁', label: '#기타/서프라이즈', image: 'cat-other.png'   },
  '빵':   { emoji: '🥐', label: '#빵',   image: 'cat-bread.png'   },
  '떡':   { emoji: '🍡', label: '#떡',   image: 'cat-tteok.png'   },
  '반찬': { emoji: '🥘', label: '#반찬', image: 'cat-banchan.png' },
  '카페': { emoji: '☕', label: '#카페', image: 'cat-dessert.png' },
  '기타': { emoji: '🎁', label: '#기타', image: 'cat-other.png'   },
};

function getCategoryImage(category?: string | null): string | null {
  if (!category) return null;
  return CATEGORY_META[category]?.image ?? 'cat-other.png';
}

// ─── Nominatim 검색 결과 타입 ────────────────────────────────────────────────
interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  class: string;
}

async function nominatimSearch(query: string): Promise<NominatimResult[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&countrycodes=kr&accept-language=ko`;
    const r = await fetch(url, { headers: { 'User-Agent': 'LastHeroApp/1.0' } });
    return await r.json();
  } catch { return []; }
}

function formatNominatimLabel(displayName: string): string {
  const parts = displayName.split(',').map(s => s.trim());
  return parts.slice(0, 2).join(' ');
}

// 동/읍/면/구 단위 키워드 추출 (엄격 주소 필터링에 사용)
function extractKeyword(displayName: string): string {
  return displayName.split(',')[0].trim();
}

type UserLocation =
  | { type: 'gps'; lat: number; lng: number; label: string; keyword?: string }
  | { type: 'district'; district: string; label: string }
  | { type: 'none' };

// 클라이언트 사이드 Haversine 거리 계산 (km)
function clientHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getStoredLocation(): UserLocation {
  try {
    const raw = localStorage.getItem('last_hero_location');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { type: 'none' };
}
function saveLocation(loc: UserLocation) {
  localStorage.setItem('last_hero_location', JSON.stringify(loc));
}

// ─── 위치 권한 설정 가이드 모달 ────────────────────────────────────────────────
function LocationGuideModal({ onClose }: { onClose: () => void }) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const steps = isIOS
    ? [
        { icon: '🌐', title: '주소창 확인', desc: 'Safari 주소창 왼쪽의 "AA" 아이콘을 탭하세요.' },
        { icon: '⚙️', title: '웹 사이트 설정', desc: '"웹 사이트 설정"을 탭하면 권한 목록이 열립니다.' },
        { icon: '📍', title: '위치 허용', desc: '"위치" → "허용"으로 변경 후 페이지를 새로고침하세요.' },
      ]
    : [
        { icon: '🔒', title: '주소창 자물쇠', desc: 'Chrome 주소창 왼쪽 자물쇠(🔒) 아이콘을 탭하세요.' },
        { icon: '⚙️', title: '사이트 설정', desc: '"사이트 설정" → "위치"를 탭합니다.' },
        { icon: '📍', title: '위치 허용', desc: '"허용"으로 변경 후 페이지를 새로고침하세요.' },
      ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-5" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zen-border bg-zen-green">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-white" />
            <h3 className="font-bold text-white text-base">위치 권한 허용 방법</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
        <div className="p-5">
          <p className="text-xs text-zen-sub mb-4 font-medium">
            {isIOS ? '📱 iPhone (iOS Safari)' : '🤖 Android (Chrome)'} 기준 안내입니다.
          </p>
          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-zen-green-bg border-2 border-zen-green flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-black text-zen-green">{i + 1}</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-base">{step.icon}</span>
                    <p className="font-bold text-[14px] text-zen-text">{step.title}</p>
                  </div>
                  <p className="text-xs text-zen-sub leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-amber-700">
              💡 설정 변경 후 반드시 <strong>페이지를 새로고침</strong>해야 반영됩니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full mt-4 py-3 bg-zen-green text-white font-bold rounded-xl text-sm hover:bg-[#3D6B4F] transition-colors"
          >
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 위치 설정 모달 (전국 지명 검색 — Nominatim) ────────────────────────────
function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kh = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setOffset(kh);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return offset;
}

function LocationModal({ onClose, onSave }: { onClose: () => void; onSave: (loc: UserLocation) => void }) {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboardOffset = useKeyboardOffset();

  // Body scroll lock (iOS + Android)
  useEffect(() => {
    const scrollY = window.scrollY;
    const prev = { pos: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.position = prev.pos;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const handleGPS = useCallback(() => {
    if (!navigator.geolocation) { setGpsError('이 브라우저는 GPS를 지원하지 않습니다.'); return; }
    setGpsLoading(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: UserLocation = { type: 'gps', lat: pos.coords.latitude, lng: pos.coords.longitude, label: '현재 위치' };
        saveLocation(loc); onSave(loc); setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === 1) setGpsError('위치 권한이 차단되었습니다. 브라우저 설정에서 허용 후 재시도하세요.');
        else setGpsError('위치를 가져오지 못했습니다. 아래에서 지역을 검색해 주세요.');
      },
      { timeout: 8000 }
    );
  }, [onSave]);

  const handleSearchChange = (q: string) => {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const data = await nominatimSearch(q);
      setResults(data);
      setSearching(false);
    }, 600);
  };

  const handleSelect = (r: NominatimResult) => {
    const loc: UserLocation = {
      type: 'gps',
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      label: formatNominatimLabel(r.display_name),
      keyword: extractKeyword(r.display_name),
    };
    saveLocation(loc); onSave(loc);
  };

  const handleInputFocus = () => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 100);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/40 backdrop-blur-sm"
      style={{ alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-2xl overflow-hidden"
        style={{
          maxHeight: '85dvh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
          transform: `translateY(-${keyboardOffset}px)`,
          transition: keyboardOffset > 0 ? 'transform 0.18s ease-out' : 'transform 0.22s ease-in',
          willChange: 'transform',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zen-border flex-shrink-0">
          <h2 className="text-lg font-bold text-zen-text">내 동네 설정</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zen-warm transition-colors">
            <X className="w-5 h-5 text-zen-sub" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 overscroll-contain">
          {/* GPS 버튼 */}
          <button
            onClick={handleGPS}
            disabled={gpsLoading}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-zen-green text-white rounded-xl font-semibold text-[15px] disabled:opacity-50 hover:bg-[#3D6B4F] transition-colors mb-5"
          >
            <Navigation className={`w-4 h-4 ${gpsLoading ? 'animate-spin' : ''}`} />
            {gpsLoading ? 'GPS 확인 중...' : '현재 위치 자동 설정'}
          </button>
          {gpsError && <p className="text-zen-red text-xs mb-4 font-medium">{gpsError}</p>}

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-zen-border" />
            <span className="text-xs font-medium text-zen-muted">또는 지역명 직접 검색</span>
            <div className="flex-1 h-px bg-zen-border" />
          </div>

          {/* 전국 지명 검색창 */}
          <div className="relative mb-2">
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={handleInputFocus}
              placeholder="논현동, 봉담읍, 해운대구, 제주시..."
              className="w-full px-4 py-3 rounded-xl border-[1.5px] border-zen-border text-sm focus:outline-none focus:border-zen-green transition-colors pr-10"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-zen-green border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <p className="text-[11px] text-zen-muted mb-3">전국 어디든 동/읍/면/구 단위로 검색하면 주변 업체를 보여드립니다.</p>

          {/* 검색 결과 */}
          {results.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {results.map(r => (
                <button
                  key={r.place_id}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-start gap-3 px-4 py-3 border border-zen-border rounded-xl bg-white hover:border-zen-green hover:bg-zen-green-bg transition-all text-left"
                >
                  <MapPin className="w-4 h-4 text-zen-green mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zen-text truncate">{formatNominatimLabel(r.display_name)}</p>
                    <p className="text-[11px] text-zen-muted truncate">{r.display_name}</p>
                  </div>
                  <span className="ml-auto text-xs text-zen-green font-semibold flex-shrink-0">선택 →</span>
                </button>
              ))}
            </div>
          )}
          {search.trim() && !searching && results.length === 0 && (
            <p className="text-sm text-zen-muted text-center py-6">검색 결과가 없습니다.<br/>다른 지명으로 검색해보세요.</p>
          )}
          {!search.trim() && (
            <div className="text-center py-8 text-zen-muted">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">동네 이름을 입력하면<br/>전국 어디든 검색됩니다</p>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-zen-border bg-zen-warm flex-shrink-0">
          <button
            onClick={() => { saveLocation({ type: 'none' }); onSave({ type: 'none' }); }}
            className="w-full py-2.5 text-sm font-medium text-zen-sub rounded-lg hover:bg-zen-border transition-colors"
          >
            전체 지역 보기
          </button>
        </div>
      </div>
    </div>
  );
}

interface HeroEntry { rank: number; customerPhone: string; customerName: string; totalOrders: number; }
interface PublicStats {
  heroRanking: HeroEntry[];
  totalFreeBags: number; totalPaidBags: number;
  totalFoodSavedKg: number; totalTreesSaved: number; totalDonationAmount: number;
}

// 픽업 안전 버퍼 상수 (분)
const SAFETY_BUFFER_MINS = 20;
const URGENCY_MINS = 30;

export default function Home() {
  const [, setLocation] = useLocation();
  const [userLoc, setUserLoc] = useState<UserLocation>(getStoredLocation);
  const [showModal, setShowModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // 세션 메모리에만 저장 — 새 탭/새로고침 시 자동 초기화 (localStorage 기록 안 함)
  const [locDenied, setLocDenied] = useState(false);
  const [locRequesting, setLocRequesting] = useState(false);
  const [permBlocked, setPermBlocked] = useState(false);
  // 거리 표시 전용 GPS 좌표 — userLoc 모드와 무관하게 항상 수집 시도
  // null = 아직 시도 전 또는 로딩 중, 'denied' = 권한 거부됨
  const [silentGpsPos, setSilentGpsPos] = useState<{ lat: number; lng: number } | 'denied' | null>(null);
  const [bannerDistSearch, setBannerDistSearch] = useState('');
  const [bannerResults, setBannerResults] = useState<NominatimResult[]>([]);
  const [bannerSearching, setBannerSearching] = useState(false);
  const bannerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [dbCategories, setDbCategories] = useState<{ id: number; name: string; emoji: string }[]>([]);
  const [urgencyBag, setUrgencyBag] = useState<{ id: number; sellerName: string; closingTime: string; type: string; price: number } | null>(null);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const requestGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setLocDenied(true);
      setPermBlocked(true);
      setSilentGpsPos('denied');
      return;
    }
    setLocRequesting(true);
    setPermBlocked(false);
    // 먼저 정밀도 낮게 빠르게 시도 — iOS 베타/Chrome 차단 환경 대응
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: UserLocation = { type: 'gps', lat: pos.coords.latitude, lng: pos.coords.longitude, label: '현재 위치' };
        saveLocation(loc);
        setUserLoc(loc);
        setSilentGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocDenied(false);
        setPermBlocked(false);
        setLocRequesting(false);
      },
      (err) => {
        if (err.code === 1) {
          // PERMISSION_DENIED: 완전 차단
          setPermBlocked(true);
          setLocDenied(true);
          setLocRequesting(false);
          setSilentGpsPos('denied');
        } else {
          // TIMEOUT / POSITION_UNAVAILABLE: 정밀도 낮춰서 재시도
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const loc: UserLocation = { type: 'gps', lat: pos.coords.latitude, lng: pos.coords.longitude, label: '현재 위치' };
              saveLocation(loc); setUserLoc(loc); setSilentGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocDenied(false); setPermBlocked(false); setLocRequesting(false);
            },
            () => { setLocDenied(true); setLocRequesting(false); setSilentGpsPos('denied'); },
            { timeout: 15000, enableHighAccuracy: false, maximumAge: 60000 }
          );
        }
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  // 이전 버전 거부 기록 완전 삭제 (마이그레이션 클린업)
  useEffect(() => {
    localStorage.removeItem('last_hero_gps_denied');
  }, []);

  // GPS 자동 요청: 위치 미설정 시 접속마다 무조건 요청 (거부 기록 무시)
  useEffect(() => {
    const stored = getStoredLocation();
    if (stored.type === 'none' && navigator.geolocation) {
      requestGPS();
    }
  }, [requestGPS]);

  // silentGpsPos 동기화: userLoc이 gps 타입이면 즉시 반영
  useEffect(() => {
    if (userLoc.type === 'gps') {
      setSilentGpsPos({ lat: userLoc.lat, lng: userLoc.lng });
    }
  }, [userLoc]);

  // silentGpsPos 수집: '전체 지역 보기' 모드에서 거리 표시를 위해 조용히 위치 요청
  useEffect(() => {
    if (userLoc.type !== 'none') return;
    if (silentGpsPos !== null) return;
    if (!navigator.geolocation) { setSilentGpsPos('denied'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setSilentGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setSilentGpsPos('denied'),
      { timeout: 10000, enableHighAccuracy: false, maximumAge: 120000 }
    );
  }, [userLoc.type, silentGpsPos]);

  // ─── 클라이언트 시계: 서버 재호출 없이 1분마다 만료 상품 자동 숨김 ───
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // ─── 소비자 공지 ────────────────────────────────────────────────────────────
  const [customerNotices, setCustomerNotices] = useState<{ id: number; title: string; content: string }[]>([]);
  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(`${base}/api/notices?target=customer`)
      .then(r => r.json())
      .then(d => setCustomerNotices(Array.isArray(d) ? d.slice(0, 3) : []))
      .catch(() => {});
  }, []);

  // ─── 카테고리 목록 (DB 동적) ────────────────────────────────────────────────
  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(`${base}/api/categories`)
      .then(r => r.json())
      .then(d => Array.isArray(d) && setDbCategories(d))
      .catch(() => {});
  }, []);

  // ─── 배너 지역 검색 (Nominatim) ────────────────────────────────────────────
  const handleBannerSearch = useCallback((q: string) => {
    setBannerDistSearch(q);
    if (bannerSearchTimer.current) clearTimeout(bannerSearchTimer.current);
    if (!q.trim()) { setBannerResults([]); setBannerSearching(false); return; }
    setBannerSearching(true);
    bannerSearchTimer.current = setTimeout(async () => {
      const data = await nominatimSearch(q);
      setBannerResults(data);
      setBannerSearching(false);
    }, 600);
  }, []);

  const handleBannerSelect = useCallback((r: NominatimResult) => {
    const loc: UserLocation = {
      type: 'gps',
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      label: formatNominatimLabel(r.display_name),
      keyword: extractKeyword(r.display_name),
    };
    saveLocation(loc);
    setUserLoc(loc);
    setLocDenied(false);
    setBannerDistSearch('');
    setBannerResults([]);
  }, []);

  // ─── 풀투리프레시 ────────────────────────────────────────────────────────────
  const [pulling, setPulling] = useState(false);
  const [pullY, setPullY] = useState(0);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const bagParams: ListBagsParams =
    userLoc.type === 'gps'   ? { lat: userLoc.lat, lng: userLoc.lng, radius: 2 }
    : userLoc.type === 'district' ? { district: userLoc.district }
    : {};

  // staleTime: Infinity → 최초 1회만 서버 호출, 이후 자동 재호출 없음
  const { data: rawBags, isLoading: isBagsLoading, refetch: refetchBags } = useListBags(bagParams, {
    query: {
      queryKey: getListBagsQueryKey(bagParams),
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    }
  });

  // 클라이언트 시계(now) 기준 필터 — 서버 재호출 없이 1분마다 자동 갱신
  const bags = rawBags?.filter(b =>
    b.status === 'active' &&
    b.remainingQuantity > 0 &&
    new Date(b.closingTime) > now
  );

  const { data: stats, refetch: refetchStats } = useQuery<PublicStats>({
    queryKey: ['public-stats'],
    queryFn: (): Promise<PublicStats> => fetch('/api/stats').then(r => r.json()),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // 수동 새로고침 (풀투리프레시 완료 시 호출)
  const handleRefresh = useCallback(() => {
    refetchBags();
    refetchStats();
  }, [refetchBags, refetchStats]);

  // 풀투리프레시 터치 이벤트
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === 0) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0 && window.scrollY === 0) {
      setPullY(Math.min(delta * 0.4, 70));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (pullY >= 60) {
      setPulling(true);
      handleRefresh();
      setTimeout(() => { setPulling(false); setPullY(0); }, 800);
    } else {
      setPullY(0);
    }
    touchStartY.current = 0;
  }, [pullY, handleRefresh]);

  const validTickets = useMemo(() => {
    expireStaleTickets();
    return getValidTickets();
  }, [now]);

  const locationLabel =
    userLoc.type === 'gps' ? (userLoc.label || '현재 위치') :
    userLoc.type === 'district' ? userLoc.district : '전체 지역';

  // 선택된 지역 키워드 (Nominatim 검색으로 저장된 경우)
  const locationKeyword = userLoc.type === 'gps' && 'keyword' in userLoc ? (userLoc as { type: 'gps'; lat: number; lng: number; label: string; keyword?: string }).keyword : undefined;

  // ── 실거리 계산 + 거리순 정렬 + 카테고리 필터 (최대 20개) ──────────────────────
  // 서버 Haversine 결과(bag.distance)를 우선 사용하고,
  // 없을 경우(전체 지역 보기 등) silentGpsPos로 클라이언트에서 직접 계산
  const filteredBags = useMemo(() => {
    if (!bags) return [];

    const pos = silentGpsPos !== 'denied' ? silentGpsPos : null;

    const withDist = bags.map((bag) => {
      let effectiveDist: number | null = bag.distance ?? null;
      if (effectiveDist === null && pos && bag.sellerLat != null && bag.sellerLng != null) {
        effectiveDist = clientHaversineKm(pos.lat, pos.lng, bag.sellerLat, bag.sellerLng);
      }
      return { ...bag, effectiveDist };
    });

    // 거리순 정렬 (거리 없는 항목은 뒤로)
    withDist.sort((a, b) => {
      if (a.effectiveDist != null && b.effectiveDist != null) return a.effectiveDist - b.effectiveDist;
      if (a.effectiveDist != null) return -1;
      if (b.effectiveDist != null) return 1;
      return 0;
    });

    // 카테고리 필터
    const filtered = selectedCategory
      ? withDist.filter(b => b.category === selectedCategory)
      : withDist;

    // 최대 20개 제한
    return filtered.slice(0, 20);
  }, [bags, selectedCategory, silentGpsPos]);

  // DB 카테고리 + CATEGORY_META 합산 (어드민에서 추가한 카테고리 우선)
  const displayCategories = useMemo(() => {
    if (dbCategories.length > 0) return dbCategories;
    return Object.entries(CATEGORY_META)
      .filter(([key]) => key.includes('/') || key.length > 2)
      .map(([name, meta], i) => ({ id: i, name, emoji: meta.emoji }));
  }, [dbCategories]);

  return (
    <NeoContainer
      className="pb-24"
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {showModal && (
        <LocationModal onClose={() => setShowModal(false)} onSave={(loc) => { setUserLoc(loc); setShowModal(false); }} />
      )}
      {showGuide && <LocationGuideModal onClose={() => setShowGuide(false)} />}

      {/* ── 번개 픽업 확인 모달 ── */}
      {urgencyBag && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setUrgencyBag(null)}>
          <div
            className="bg-[#FAFAF7] rounded-t-3xl w-full max-w-md p-5 pb-8 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4">
              <span className="text-4xl">⚡</span>
            </div>
            <h3 className="text-xl font-extrabold text-zen-text text-center mb-1">번개 픽업 확인</h3>
            <p className="text-sm text-zen-sub text-center mb-4 leading-relaxed">
              <strong className="text-zen-text">{urgencyBag.sellerName}</strong>의<br/>
              이 상품은{' '}
              <span className="font-extrabold text-[#C0392B] text-base">
                {format(new Date(urgencyBag.closingTime), 'HH:mm', { locale: ko })}
              </span>
              에 폐기됩니다.<br/>
              <strong>지금 바로 가서 픽업 가능하신가요?</strong>
            </p>
            <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 mb-5">
              <p className="text-xs font-bold text-[#C0392B] text-center leading-relaxed">
                마감 시간까지 미방문 시 상품은 즉시 폐기되며,<br/>이로 인한 환불은 불가능합니다.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setUrgencyBag(null)}
                className="flex-1 py-3.5 rounded-xl border-2 border-zen-border font-bold text-zen-sub hover:bg-zen-warm transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => { setLocation(`/checkout/${urgencyBag.id}`); setUrgencyBag(null); }}
                className="flex-1 py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 font-extrabold text-white transition-colors"
              >
                🏃 픽업 갑니다!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 풀투리프레시 인디케이터 ── */}
      {(pullY > 0 || pulling) && (
        <div
          className="flex items-center justify-center gap-2 text-zen-green text-xs font-semibold transition-all overflow-hidden"
          style={{ height: pulling ? 48 : pullY, opacity: Math.min(pullY / 60, 1) }}
        >
          <RefreshCw className={`w-4 h-4 ${pulling ? 'animate-spin' : ''}`} />
          {pulling ? '새로고침 중…' : pullY >= 60 ? '놓으면 새로고침' : '당겨서 새로고침'}
        </div>
      )}

      {/* ── 헤더 ── */}
      <div className="px-5 pt-8 pb-6 bg-zen-bg border-b border-zen-border">
        {/* 내 동네 버튼 + 새로고침 버튼 */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 text-zen-green font-semibold text-sm hover:opacity-80 transition-opacity"
          >
            <MapPin className="w-4 h-4" />
            {locationLabel}
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>
          <button
            onClick={handleRefresh}
            disabled={isBagsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zen-border text-zen-sub text-xs font-medium hover:bg-zen-warm transition-colors disabled:opacity-40"
            title="목록 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBagsLoading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {/* GPS 거부 배너 — 세션 내에서만 표시, 새로고침 시 초기화 */}
        {locDenied && userLoc.type === 'none' && !permBlocked && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
            <div className="px-4 py-3 flex items-start gap-3">
              <span className="text-xl flex-shrink-0 mt-0.5">📍</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800 leading-snug">위치를 허용하면 주변 2km 상점을 바로 볼 수 있어요!</p>
                <p className="text-xs text-amber-600 mt-0.5">지금은 전체 지역 상점을 보여드립니다.</p>
              </div>
            </div>
            <div className="px-4 pb-4 space-y-2.5">
              <button
                onClick={requestGPS}
                disabled={locRequesting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white bg-zen-green hover:bg-[#3D6B4F] transition-colors disabled:opacity-50 shadow-sm"
              >
                {locRequesting ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><LocateFixed className="w-4 h-4" />📍 다시 내 위치 찾기</>
                )}
              </button>
              {/* ── 동네 검색창 (Nominatim 전국) ── */}
              <div className="bg-white border-2 border-amber-400 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-amber-400 px-4 py-3 flex items-center gap-2">
                  <span className="text-lg">🔍</span>
                  <p className="text-sm font-extrabold text-white leading-snug">전국 지명 검색으로 주변 맛집 찾기</p>
                </div>
                <p className="text-xs text-amber-700 font-medium px-4 pt-2.5 pb-1">논현동, 봉담읍, 해운대구, 제주시 어디든 검색하면 주변 업체를 거리순으로 보여드려요!</p>
                <div className="px-4 pb-3 pt-1 relative">
                  <input
                    type="text"
                    value={bannerDistSearch}
                    onChange={e => handleBannerSearch(e.target.value)}
                    placeholder="동/읍/면/구 단위로 검색..."
                    autoComplete="off"
                    className="w-full px-4 py-4 border-2 border-amber-300 rounded-xl text-base font-semibold focus:outline-none focus:border-amber-500 bg-amber-50 placeholder-amber-400 text-zen-text pr-12"
                  />
                  {bannerSearching && (
                    <span className="absolute right-7 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                {bannerDistSearch.trim() && (
                  <div className="border-t-2 border-amber-200 max-h-52 overflow-y-auto">
                    {bannerResults.map(r => (
                      <button
                        key={r.place_id}
                        onClick={() => handleBannerSelect(r)}
                        className="w-full text-left px-5 py-4 text-base font-bold text-amber-900 hover:bg-amber-50 active:bg-amber-100 flex items-center gap-3 transition-colors border-b border-amber-100 last:border-0"
                      >
                        <MapPin className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-amber-900 truncate">{formatNominatimLabel(r.display_name)}</p>
                          <p className="text-[11px] text-amber-600 truncate">{r.display_name}</p>
                        </div>
                        <span className="ml-auto text-xs font-medium text-amber-500">선택 →</span>
                      </button>
                    ))}
                    {!bannerSearching && bannerResults.length === 0 && (
                      <p className="px-5 py-4 text-sm text-amber-500 font-medium">검색 결과 없음 — 다른 지명을 입력해 보세요.</p>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowGuide(true)}
                className="w-full text-xs font-semibold text-amber-600 hover:text-amber-800 underline transition-colors text-center py-0.5"
              >
                위치 허용 방법 보기 →
              </button>
            </div>
          </div>
        )}

        {/* 브라우저 차단 배너 (설정에서 완전 차단된 경우) */}
        {locDenied && userLoc.type === 'none' && permBlocked && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 overflow-hidden">
            <div className="px-4 py-3 flex items-start gap-3">
              <span className="text-xl flex-shrink-0 mt-0.5">🚫</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-800 leading-snug">위치 권한이 차단되어 있습니다!</p>
                <p className="text-xs text-red-600 mt-0.5">브라우저 설정에서 위치 권한을 허용해 주세요.</p>
                {isIOS && (
                  <p className="text-xs text-red-500 mt-1 font-medium">📱 위치 확인이 안 될 경우 <strong>사파리(Safari) 앱</strong>을 이용해 보세요.</p>
                )}
              </div>
            </div>
            <div className="px-4 pb-4 space-y-2.5">
              <button
                onClick={requestGPS}
                disabled={locRequesting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white bg-[#C0392B] hover:bg-[#A93226] transition-colors disabled:opacity-50"
              >
                {locRequesting ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><LocateFixed className="w-4 h-4" />📍 다시 내 위치 찾기</>
                )}
              </button>
              {/* ── 동네 검색창 (Nominatim 전국 — 차단 버전) ── */}
              <div className="bg-white border-2 border-red-400 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-[#C0392B] px-4 py-3 flex items-center gap-2">
                  <span className="text-lg">🔍</span>
                  <p className="text-sm font-extrabold text-white leading-snug">전국 지명 검색으로 주변 맛집 찾기</p>
                </div>
                <p className="text-xs text-red-700 font-medium px-4 pt-2.5 pb-1">논현동, 봉담읍, 해운대구 어디든 — 전국 어디서든 검색 한 번으로!</p>
                <div className="px-4 pb-3 pt-1 relative">
                  <input
                    type="text"
                    value={bannerDistSearch}
                    onChange={e => handleBannerSearch(e.target.value)}
                    placeholder="동/읍/면/구 단위로 검색..."
                    autoComplete="off"
                    className="w-full px-4 py-4 border-2 border-red-300 rounded-xl text-base font-semibold focus:outline-none focus:border-red-500 bg-red-50 placeholder-red-300 text-zen-text pr-12"
                  />
                  {bannerSearching && (
                    <span className="absolute right-7 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                {bannerDistSearch.trim() && (
                  <div className="border-t-2 border-red-200 max-h-52 overflow-y-auto">
                    {bannerResults.map(r => (
                      <button
                        key={r.place_id}
                        onClick={() => handleBannerSelect(r)}
                        className="w-full text-left px-5 py-4 text-base font-bold text-red-900 hover:bg-red-50 active:bg-red-100 flex items-center gap-3 transition-colors border-b border-red-100 last:border-0"
                      >
                        <MapPin className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-red-900 truncate">{formatNominatimLabel(r.display_name)}</p>
                          <p className="text-[11px] text-red-600 truncate">{r.display_name}</p>
                        </div>
                        <span className="ml-auto text-xs font-medium text-red-400">선택 →</span>
                      </button>
                    ))}
                    {!bannerSearching && bannerResults.length === 0 && (
                      <p className="px-5 py-4 text-sm text-red-400 font-medium">검색 결과 없음 — 다른 지명을 입력해 보세요.</p>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowGuide(true)}
                className="w-full text-xs font-bold text-red-600 hover:text-red-800 underline transition-colors text-center py-0.5"
              >
                설정 가이드 보기 →
              </button>
            </div>
          </div>
        )}

        {/* 지역 선택 안내 배너 */}
        {userLoc.type === 'district' && (
          <div className="mb-4 rounded-xl border border-zen-border bg-zen-warm px-4 py-2.5 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-zen-green flex-shrink-0" />
            <p className="text-sm text-zen-sub font-medium flex-1">선택하신 <span className="font-bold text-zen-green">{userLoc.district}</span> 지역 상점입니다</p>
            <button onClick={() => setShowModal(true)} className="text-xs text-zen-green font-semibold underline flex-shrink-0">변경</button>
          </div>
        )}

        {/* 메인 카피 */}
        <h1
          translate="no"
          className="font-bold text-zen-text leading-tight mb-3"
          style={{ fontSize: '32px', fontWeight: 700, marginTop: '40px' }}
        >
          지구를 구하는 맛있는 습관,<br />라스트 히어로 🌲
        </h1>
        <p
          className="font-medium mb-6 leading-relaxed"
          style={{ fontSize: '16px', color: '#666666' }}
        >
          우리 동네 마감 상품을 최대 70% 할인된 가격에 만나보세요.
        </p>

        {/* 3단계 이용 가이드 */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { icon: '🔍', step: '1', title: '가게 탐색', desc: '내 동네 마감 상품 확인' },
            { icon: '🛍️', step: '2', title: '예약 결제', desc: '서프라이즈백 선점' },
            { icon: '📲', step: '3', title: 'QR 픽업', desc: '가게에서 QR 스캔' },
          ].map(({ icon, step, title, desc }) => (
            <div key={step} className="bg-white border border-zen-border rounded-xl p-3 text-center">
              <div className="text-xl mb-1">{icon}</div>
              <div className="font-bold text-zen-green mb-0.5" style={{ fontSize: '14px' }}>{title}</div>
              <div className="text-zen-muted leading-tight" style={{ fontSize: '11px' }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* ESG 카운터 */}
        {stats && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { val: `${stats.totalFoodSavedKg.toFixed(1)}kg`, label: '구출한 음식' },
                { val: `${stats.totalTreesSaved.toFixed(1)}그루`, label: '소나무 효과' },
              ].map(({ val, label }) => (
                <div key={label} className="bg-zen-green-bg border border-zen-border rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-zen-green">{val}</div>
                  <div className="text-xs text-zen-muted font-medium mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            <p className="text-center text-zen-muted px-1" style={{ fontSize: '10px', lineHeight: '1.5' }}>
              위 수치는 환경 보호 활동에 따른 추정 산출값입니다
            </p>
          </div>
        )}
      </div>

      {/* ── 소비자 공지 ── */}
      {customerNotices.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {customerNotices.map(n => (
            <div key={n.id} className="bg-[#FFF7ED] border border-[#FED7AA] rounded-xl px-4 py-3">
              <p className="text-xs font-black text-[#92400E] mb-1">📢 공지사항</p>
              <p className="font-bold text-sm text-[#92400E] leading-tight">{n.title}</p>
              <p className="text-xs text-[#92400E]/80 mt-1 leading-relaxed whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── 서프라이즈백 목록 ── */}
      <div className="px-4 py-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-zen-text">오늘의 서프라이즈백</h2>
          {userLoc.type !== 'none' && (
            <span className="text-xs font-semibold text-zen-green bg-zen-green-bg px-2.5 py-1 rounded-full">
              📍 {locationKeyword ?? locationLabel}
            </span>
          )}
        </div>

        {/* ── 카테고리 필터 칩 (DB 동적) ── */}
        {displayCategories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 mb-3 -mx-1 px-1 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                selectedCategory === null
                  ? 'bg-zen-text text-white border-zen-text'
                  : 'bg-white text-zen-sub border-zen-border hover:border-zen-green'
              }`}
            >
              전체
            </button>
            {displayCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(prev => prev === cat.name ? null : cat.name)}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  selectedCategory === cat.name
                    ? 'bg-zen-green text-white border-zen-green'
                    : 'bg-white text-zen-sub border-zen-border hover:border-zen-green hover:text-zen-green'
                }`}
              >
                <span>{cat.emoji}</span>
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {isBagsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-36 bg-zen-warm rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredBags.length === 0 ? (
          <NeoCard className="text-center py-12 rounded-xl">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-zen-muted" />
            <p className="text-zen-text font-bold text-base mb-1">
              {selectedCategory
                ? `'${selectedCategory}' 카테고리 서프라이즈백이 없어요`
                : userLoc.type === 'gps'
                  ? '주변 2km 내에 진행 중인 서프라이즈백이 없어요'
                  : '현재 진행 중인 서프라이즈백이 없어요'}
            </p>
            <p className="text-sm text-zen-muted mt-1 mb-4">
              {selectedCategory
                ? '카테고리 필터를 해제하거나 다른 카테고리를 선택해보세요'
                : userLoc.type === 'gps'
                  ? '반경 2km 내 등록된 가게가 아직 없어요. 조금 후 다시 확인해주세요.'
                  : '조금 후 다시 확인해주세요'}
            </p>
            {selectedCategory && (
              <button onClick={() => setSelectedCategory(null)} className="text-sm text-zen-green font-semibold hover:underline">
                전체 보기
              </button>
            )}
            {!selectedCategory && userLoc.type !== 'none' && (
              <button onClick={() => setShowModal(true)} className="text-sm text-zen-green font-semibold hover:underline">
                다른 지역 선택하기
              </button>
            )}
          </NeoCard>
        ) : (
          <div className="space-y-3">
            {filteredBags.map((bag) => {
              const isFree = bag.type === 'free';
              const { effectiveDist } = bag;

              return (
                <div key={bag.id} className="relative">
                  <div className="bg-white rounded-xl border border-zen-border overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                    {/* 상단 포인트 바 */}
                    <div className={`h-1 w-full ${isFree ? 'bg-zen-green' : 'bg-[#2C3E50]'}`} />

                    <div className="flex h-[120px]">
                      {/* 이미지 */}
                      {(() => {
                        const catFile = getCategoryImage(bag.category);
                        const imgSrc = bag.imageUrl
                          || (catFile ? `${import.meta.env.BASE_URL}images/${catFile}` : null)
                          || `${import.meta.env.BASE_URL}images/bag-placeholder.png`;
                        const catMeta = bag.category ? CATEGORY_META[bag.category] : null;
                        return (
                          <div className="w-[120px] bg-zen-warm flex-shrink-0 relative overflow-hidden">
                            <img
                              src={imgSrc}
                              alt={bag.category || '서프라이즈백'}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-2 left-2">
                              <span className={isFree ? 'zen-tag-free' : 'zen-tag-paid'}>
                                {isFree ? '무료 나눔' : '할인 특가'}
                              </span>
                            </div>
                            {catMeta && (
                              <div className="absolute bottom-1.5 left-0 right-0 flex justify-center">
                                <span className="bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
                                  {catMeta.emoji} {catMeta.label}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 정보 */}
                      {(() => {
                        const discountPct = !isFree && bag.originalPrice > 0 && bag.originalPrice > bag.price
                          ? Math.round((1 - bag.price / bag.originalPrice) * 100)
                          : null;
                        return (
                          <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0">
                            <div>
                              <div className="flex items-start justify-between gap-1">
                                <h3 className="text-[15px] font-bold text-zen-text truncate flex-1">{bag.sellerName}</h3>
                                {effectiveDist != null ? (
                                  <span className="text-xs font-semibold text-zen-green bg-zen-green-bg px-2 py-0.5 rounded-full flex-shrink-0 ml-1">
                                    내 위치에서 {effectiveDist < 1 ? `${Math.round(effectiveDist * 1000)}m` : `${effectiveDist.toFixed(1)}km`}
                                  </span>
                                ) : silentGpsPos === 'denied' ? (
                                  <span className="text-xs font-medium text-zen-muted bg-zen-warm px-2 py-0.5 rounded-full flex-shrink-0 ml-1">
                                    위치 확인 불가
                                  </span>
                                ) : silentGpsPos === null ? (
                                  <span className="text-xs font-medium text-zen-muted bg-zen-warm px-2 py-0.5 rounded-full flex-shrink-0 ml-1 animate-pulse">
                                    위치 확인 중…
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-xs text-zen-muted flex items-center mt-0.5 truncate">
                                <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />{bag.sellerAddress}
                              </p>
                              {bag.sellerDetailAddress && (
                                <p className="text-[11px] text-zen-sub flex items-center mt-0.5 truncate pl-4">
                                  {bag.sellerDetailAddress}
                                </p>
                              )}
                            </div>
                            <div className="flex items-end justify-between">
                              <div>
                                {/* 할인율 배지 */}
                                {discountPct !== null && (
                                  <span className="inline-block bg-[#C0392B] text-white text-[11px] font-black px-2 py-0.5 rounded-md mb-1">
                                    {discountPct}% OFF
                                  </span>
                                )}
                                {/* 이중 가격: 원가 취소선 + 할인가 */}
                                {!isFree && bag.originalPrice > bag.price ? (
                                  <div>
                                    <div className="text-xs text-zen-muted line-through leading-none mb-0.5">
                                      {bag.originalPrice.toLocaleString()}원
                                    </div>
                                    <span className="text-[22px] font-black text-zen-text leading-none">
                                      {bag.price.toLocaleString()}원
                                    </span>
                                  </div>
                                ) : (
                                  <span className={`text-xl font-bold ${isFree ? 'text-zen-green' : 'text-zen-text'}`}>
                                    {isFree ? '무료' : `${bag.price.toLocaleString()}원`}
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-zen-red flex items-center gap-1 font-medium">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(bag.closingTime), 'HH:mm', { locale: ko })} 마감
                                </div>
                                <div className={`text-xs font-medium mt-0.5 ${bag.remainingQuantity <= 2 ? 'text-zen-red' : 'text-zen-muted'}`}>
                                  잔여 {bag.remainingQuantity}개
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* 예약 버튼 — 마감 시간 기반 분기 */}
                    {(() => {
                      const msLeft = new Date(bag.closingTime).getTime() - now.getTime();
                      const minsLeft = msLeft / 60_000;
                      if (minsLeft <= SAFETY_BUFFER_MINS) {
                        return (
                          <div className="bg-gray-400 py-3 text-center text-sm font-bold text-white cursor-not-allowed select-none">
                            🔒 결제 마감 (마감 {SAFETY_BUFFER_MINS}분 전 이후 불가)
                          </div>
                        );
                      }
                      if (minsLeft <= URGENCY_MINS) {
                        return (
                          <button
                            onClick={() => setUrgencyBag({ id: bag.id, sellerName: bag.sellerName, closingTime: bag.closingTime, type: bag.type, price: bag.price })}
                            className="w-full py-3 text-center text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 transition-colors"
                          >
                            ⚡ 번개 픽업 — 마감 {Math.ceil(minsLeft)}분 전
                          </button>
                        );
                      }
                      return (
                        <Link
                          href={`/checkout/${bag.id}`}
                          className={`block py-3 text-center text-sm font-bold transition-colors ${isFree ? 'bg-zen-green text-white hover:bg-[#3D6B4F]' : 'bg-[#2C3E50] text-white hover:bg-[#1A252F]'}`}
                        >
                          서프라이즈백 예약하기 →
                        </Link>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 히어로 랭킹 ── */}
      {stats?.heroRanking && stats.heroRanking.length > 0 && (
        <div className="mx-4 mb-6 bg-white border border-zen-border rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <div className="px-5 py-4 border-b border-zen-border flex items-center gap-2">
            <Leaf className="w-4 h-4 text-zen-green" />
            <h2 className="text-base font-bold text-zen-text">이번 달 동네 히어로</h2>
            <TrendingUp className="w-3.5 h-3.5 text-zen-muted ml-auto" />
          </div>
          <div className="p-4 space-y-2">
            {stats.heroRanking.slice(0, 3).map((hero, idx) => (
              <div key={idx} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-zen-warm">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${idx === 0 ? 'bg-[#FFD700] text-white' : idx === 1 ? 'bg-[#C0C0C0] text-white' : 'bg-[#CD7F32] text-white'}`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-zen-text truncate">{hero.customerName || `히어로 ${hero.customerPhone.slice(-4)}`}</div>
                  <div className="text-xs text-zen-muted">지구 구출 {hero.totalOrders}회</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 픽업 티켓 플로팅 배너 (단일) ── */}
      {validTickets.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-50 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <Link href={validTickets.length === 1 ? `/qr/${validTickets[0].qrToken}` : '/my-tickets'}>
              <NeoButton variant="primary" className="w-full py-4 shadow-[0_4px_20px_rgba(77,124,95,0.35)] flex items-center justify-center gap-2">
                <span>🎫 내 픽업 QR 코드 보기</span>
                {validTickets.length > 1 && (
                  <span className="bg-white/25 text-white text-xs font-black px-2 py-0.5 rounded-full">
                    {validTickets.length}개
                  </span>
                )}
              </NeoButton>
            </Link>
          </div>
        </div>
      )}

      {/* ── 하단 네비게이션 ── */}
      <div className="px-5 py-4 border-t border-zen-border bg-white flex justify-between items-center text-sm mt-4">
        <Link href="/seller" className="font-semibold text-zen-text hover:text-zen-green transition-colors">
          👨‍🍳 판매자 포털
        </Link>
        <Link
          href="/admin"
          className="text-xs text-zen-muted border border-zen-border px-3 py-1.5 rounded-lg hover:border-zen-text hover:text-zen-text transition-colors font-medium"
        >
          Admin
        </Link>
      </div>
    </NeoContainer>
  );
}
