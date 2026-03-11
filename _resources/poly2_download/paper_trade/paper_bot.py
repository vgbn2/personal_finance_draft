"""
Paper Trading Bot v4 — Multi-Signal Strategy
=============================================
Polymarket 15m BTC Up/Down | $200 Paper Balance

Signals:
  1. Momentum Divergence — Binance trend not priced into Poly
  2. Mean Reversion — Buy liquidity cascade crashes  
  3. Expiry Convergence — Time decay scalp near market close

Derived from: Becker Microstructure Paper, Streak Bot (0xrsydn),
              PolyAssist (st1ne), discountry flash crash bot,
              Kelly Criterion, agent.md blueprint.

Usage:  python paper_trade/paper_bot.py
Stop:   Ctrl+C
"""

import asyncio, csv, json, logging, time, sys, os, math
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

try: import requests
except ImportError: sys.exit("pip install requests")
try: import websockets
except ImportError: sys.exit("pip install websockets")

# ═══════════════════════ CONFIG ═══════════════════════════════════════════

GAMMA_URL    = "https://gamma-api.polymarket.com/events"
SERIES_ID    = "10192"
POLY_WS      = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
BINANCE_WS   = "wss://stream.binance.com:9443/ws/btcusdt@trade"
UA           = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "application/json"}

STARTING_BAL = 200.0
MIN_EXPIRY   = 30
REFRESH_SEC  = 45
DASH_SEC     = 2
LOG_FILE     = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trade_log.csv")

# Signal 1: Momentum Divergence
MOM_BTC_WINDOW     = 60      # seconds lookback for BTC delta
MOM_BTC_THRESH     = 0.0008  # 0.08% BTC move to consider significant
MOM_POLY_GAP       = 0.06    # Poly must be this far from fair value

# Signal 2: Mean Reversion (Crash Buy)
MR_DROP_THRESH     = 0.10    # 10 cent drop in 120s
MR_DROP_WINDOW     = 120     # seconds
MR_BTC_CALM        = 0.0004  # BTC must be calm (< 0.04% in same window)

# Signal 3: Expiry Convergence
EX_TIME_WINDOW     = 300     # activate in last 5 min
EX_BTC_TREND       = 0.0006  # min BTC trend from market open (raised from 0.04%)
EX_UNDERPRICED     = 0.82    # winning side should be > this near expiry

# Risk
KELLY_FRAC   = 0.25
MAX_POS_PCT  = 0.10   # max 10% bankroll per trade
MAX_OPEN     = 1      # only 1 trade open at a time (was 3)
COOLDOWN     = 30     # seconds between trades (raised from 20)

# Exit Management
TP_PCT       = 0.60   # take profit at 60% of the way to target
SL_PCT       = 0.50   # stop loss if price drops 50% of edge below entry

logging.basicConfig(level=logging.WARNING, format="%(asctime)s|%(levelname)s|%(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("bot")

# ═══════════════════════ MODELS ═══════════════════════════════════════════

@dataclass
class Mkt:
    cid: str = ""
    q: str = ""
    up_tid: str = ""
    dn_tid: str = ""
    end_ts: float = 0
    start_ts: float = 0   # when we first saw this market
    btc_open: float = 0   # BTC price when market started
    @property
    def ttl(self): return max(0, self.end_ts - time.time())
    @property
    def ttl_str(self):
        s = int(self.ttl); return f"{s//60:02d}:{s%60:02d}"
    @property
    def ok(self): return self.ttl > MIN_EXPIRY
    @property
    def period_sec(self): return 900  # 15 min

@dataclass
class Book:
    bids: dict = field(default_factory=dict)
    asks: dict = field(default_factory=dict)
    ts: float = 0
    def bb(self): return max((float(p) for p in self.bids), default=None)
    def ba(self): return min((float(p) for p in self.asks), default=None)
    def mid(self):
        b, a = self.bb(), self.ba()
        if b and a: return (b + a) / 2
        return b or a
    def sp(self):
        b, a = self.bb(), self.ba()
        return (a - b) if (b and a) else None
    def depth(self, side, n=4):
        if side == "bid":
            return sorted(((float(p), s) for p, s in self.bids.items()), reverse=True)[:n]
        return sorted(((float(p), s) for p, s in self.asks.items()))[:n]

@dataclass
class PriceSnap:
    price: float
    ts: float

@dataclass
class Trade:
    dir: str           # UP / DOWN
    signal: str        # MOM / MR / EXP
    entry: float       # entry price (Poly mid)
    size: float        # $ risked
    ts: float
    mkt_q: str
    kelly_f: float     # kelly fraction used
    est_prob: float    # our estimated probability
    target_p: float = 0.0   # take-profit price
    stop_p: float = 0.0     # stop-loss price
    reason: str = ""   # human-readable reason
    exit_p: Optional[float] = None
    exit_reason: str = ""   # why we exited
    pnl: float = 0
    closed: bool = False
    outcome: str = ""  # UP/DOWN result

# ═══════════════════════ DISCOVERY ════════════════════════════════════════

def fetch_markets() -> list[Mkt]:
    try:
        r = requests.get(GAMMA_URL, params={"series_id": SERIES_ID, "active": "true",
                         "closed": "false", "limit": "10"}, headers=UA, timeout=10)
        r.raise_for_status(); evs = r.json()
    except Exception as e:
        log.error(f"API: {e}"); return []
    out = []
    for ev in evs:
        for m in ev.get("markets", []):
            try:
                tids = m.get("clobTokenIds", "[]")
                if isinstance(tids, str): tids = json.loads(tids)
                if len(tids) < 2: continue
                outs = m.get("outcomes", "[]")
                if isinstance(outs, str): outs = json.loads(outs)
                up, dn = None, None
                for i, lb in enumerate(outs):
                    lo = str(lb).lower()
                    if lo == "up" and i < len(tids): up = str(tids[i])
                    elif lo == "down" and i < len(tids): dn = str(tids[i])
                if not up or not dn: up, dn = str(tids[0]), str(tids[1])
                es = m.get("endDate", "")
                ets = 0
                if es:
                    try: ets = datetime.fromisoformat(es.replace("Z", "+00:00")).timestamp()
                    except: pass
                if ets <= time.time(): continue
                out.append(Mkt(cid=m.get("conditionId", ""), q=m.get("question", ev.get("title", "")),
                               up_tid=up, dn_tid=dn, end_ts=ets))
            except: pass
    out.sort(key=lambda x: x.end_ts)
    return out

# ═══════════════════════ BINANCE KLINE ════════════════════════════════════

def fetch_btc_15m_kline(market_start_ts: float) -> dict:
    """Fetch the Binance 15m kline for a specific market window.
    market_start_ts is Unix timestamp of when the 15m market opens.
    Returns {'open': float, 'close': float} or {}.
    
    Binance 15m klines are aligned to :00/:15/:30/:45.
    open = BTC price at market start, close = BTC price at market end."""
    try:
        url = "https://api.binance.com/api/v3/klines"
        start_ms = int(market_start_ts * 1000)
        params = {"symbol": "BTCUSDT", "interval": "15m",
                  "startTime": start_ms, "limit": 1}
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data and len(data) > 0:
            k = data[0]
            return {"open": float(k[1]), "high": float(k[2]),
                    "low": float(k[3]), "close": float(k[4])}
    except Exception as e:
        log.warning(f"Binance 15m kline fetch: {e}")
    return {}

def fetch_btc_price_at(ts: float) -> Optional[float]:
    """Get BTC price at a specific Unix timestamp using Binance 1m kline."""
    try:
        url = "https://api.binance.com/api/v3/klines"
        ms = int(ts * 1000)
        params = {"symbol": "BTCUSDT", "interval": "1m",
                  "startTime": ms, "limit": 1}
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data and len(data) > 0:
            return float(data[0][1])  # open of the 1m candle at that time
    except Exception as e:
        log.warning(f"Binance 1m kline: {e}")
    return None

# ═══════════════════════ KELLY ════════════════════════════════════════════

def kelly_size(est_prob: float, mkt_price: float, bankroll: float) -> float:
    """Quarter-Kelly with 10% bankroll hard cap"""
    edge = est_prob - mkt_price
    if edge <= 0.02:  # need at least 2% edge
        return 0
    f = edge / (1 - mkt_price)
    size = bankroll * f * KELLY_FRAC
    return min(size, bankroll * MAX_POS_PCT, 20.0)  # hard cap $20

# ═══════════════════════ BOT ══════════════════════════════════════════════

class Bot:
    def __init__(self):
        self.on = False
        self.mkt: Optional[Mkt] = None
        self.books: dict[str, Book] = {}
        self.bnc_q: deque = deque(maxlen=800)
        self.bnc_p: Optional[float] = None
        self.up_hist: deque = deque(maxlen=200)  # PriceSnap history for UP token
        self.dn_hist: deque = deque(maxlen=200)  # PriceSnap history for DOWN token
        self.trades: list[Trade] = []
        self.results: list[str] = []  # "UP" or "DOWN" outcome history
        self.bal = STARTING_BAL
        self.t0 = 0
        self.lr = 0
        self.p_ok = False
        self.b_ok = False
        self.p_n = 0
        self.b_n = 0
        self.last_trade_ts = 0
        self.signals_active: list[str] = []  # current active signal names

    # ── discovery ──
    def refresh(self):
        ms = fetch_markets()
        self.lr = time.time()
        if not ms: return False
        best = next((m for m in ms if m.ok), None)
        if best and (not self.mkt or best.cid != self.mkt.cid):
            # Resolve old market's trades first
            if self.mkt:
                self._resolve_market()
            self.mkt = best
            self.mkt.start_ts = time.time()
            # Get ACTUAL BTC price at market start from Binance REST API
            mkt_start_ts = best.end_ts - 900  # 15 min market
            actual_open = fetch_btc_price_at(mkt_start_ts)
            if actual_open:
                self.mkt.btc_open = actual_open
            else:
                # Fallback: use current BTC (less accurate)
                self.mkt.btc_open = self.bnc_p if self.bnc_p else 0
            self.books.clear()
            self.up_hist.clear()
            self.dn_hist.clear()
        return self.mkt is not None

    # ── main ──
    async def run(self):
        self.t0 = time.time()
        self._banner()
        if not self.refresh():
            print("  Waiting for markets...")
            await asyncio.sleep(30)
            if not self.refresh():
                print("  No markets found. Exiting.")
                return
        self.on = True
        await asyncio.gather(self._ws_poly(), self._ws_bnc(), self._rot(), self._ui(), self._sig_loop())

    def _banner(self):
        if os.name == "nt": os.system("cls")
        print()
        print("  ╔══════════════════════════════════════════════════════════════╗")
        print("  ║   POLYMARKET PAPER TRADER v4 — Multi-Signal Strategy       ║")
        print(f"  ║   Starting Balance: ${self.bal:>8.2f}                           ║")
        print("  ║   Signals: MOM | MR | EXP                                  ║")
        print("  ╚══════════════════════════════════════════════════════════════╝")
        print()

    # ── Poly WS ──
    async def _ws_poly(self):
        while self.on:
            if not self.mkt:
                await asyncio.sleep(2); continue
            mk = self.mkt
            try:
                async with websockets.connect(POLY_WS, additional_headers={"User-Agent": "Mozilla/5.0"},
                                              ping_interval=20, ping_timeout=10) as ws:
                    await ws.send(json.dumps({"assets_ids": [mk.up_tid, mk.dn_tid], "type": "market"}))
                    self.p_ok = True
                    async for msg in ws:
                        if not self.on: break
                        if self.mkt and self.mkt.cid != mk.cid: break
                        try:
                            raw = json.loads(msg)
                            if isinstance(raw, list):
                                for item in raw:
                                    if isinstance(item, dict):
                                        self.p_n += 1; self._poly(item)
                            elif isinstance(raw, dict):
                                self.p_n += 1; self._poly(raw)
                        except json.JSONDecodeError: pass
            except Exception as e:
                log.warning(f"Poly: {e}")
            self.p_ok = False
            if self.on: await asyncio.sleep(3)

    def _poly(self, d: dict):
        et = d.get("event_type", "")
        aid = d.get("asset_id", "")
        if not aid: return
        if et == "book":
            bk = Book()
            for b in d.get("bids", []):
                if not isinstance(b, dict): continue
                p, s = str(b.get("price", "0")), float(b.get("size", 0))
                if float(p) > 0 and s > 0: bk.bids[p] = s
            for a in d.get("asks", []):
                if not isinstance(a, dict): continue
                p, s = str(a.get("price", "0")), float(a.get("size", 0))
                if float(p) > 0 and s > 0: bk.asks[p] = s
            bk.ts = time.time()
            self.books[aid] = bk
        elif et == "price_change":
            bk = self.books.setdefault(aid, Book())
            changes = d.get("changes", d.get("price_changes", []))
            if not isinstance(changes, list): return
            for c in changes:
                if not isinstance(c, dict): continue
                side = c.get("side", "")
                price = str(c.get("price", "0"))
                size = float(c.get("size", 0))
                if size == 0:
                    if side == "buy": bk.bids.pop(price, None)
                    elif side == "sell": bk.asks.pop(price, None)
                else:
                    if side == "buy": bk.bids[price] = size
                    elif side == "sell": bk.asks[price] = size
            bk.ts = time.time()

        # Record price history
        if self.mkt and aid == self.mkt.up_tid:
            bk = self.books.get(aid)
            if bk:
                m = bk.mid()
                if m: self.up_hist.append(PriceSnap(m, time.time()))
        elif self.mkt and aid == self.mkt.dn_tid:
            bk = self.books.get(aid)
            if bk:
                m = bk.mid()
                if m: self.dn_hist.append(PriceSnap(m, time.time()))

    # ── Binance WS ──
    async def _ws_bnc(self):
        while self.on:
            try:
                async with websockets.connect(BINANCE_WS, ping_interval=20, ping_timeout=10) as ws:
                    self.b_ok = True
                    async for msg in ws:
                        if not self.on: break
                        try:
                            d = json.loads(msg)
                            if d.get("e") == "trade":
                                p = float(d["p"])
                                t = float(d["T"]) / 1000
                                self.bnc_q.append({"p": p, "t": t})
                                self.bnc_p = p
                                self.b_n += 1
                                # Set BTC open for current market if not yet set
                                if self.mkt and self.mkt.btc_open == 0:
                                    self.mkt.btc_open = p
                        except: pass
            except Exception as e:
                log.warning(f"Bnc: {e}")
            self.b_ok = False
            if self.on: await asyncio.sleep(3)

    # ═══════════════════════ SIGNALS ══════════════════════════════════════

    async def _sig_loop(self):
        """Check signals and exits every 3 seconds"""
        await asyncio.sleep(5)  # wait for data to fill
        while self.on:
            self._check_exits()   # check TP/SL on open positions
            self._check_signals()
            await asyncio.sleep(3)

    def _can_trade(self) -> bool:
        if not self.mkt or not self.mkt.ok: return False
        if not self.bnc_p: return False
        if self.bal < 3: return False
        if time.time() - self.last_trade_ts < COOLDOWN: return False
        open_ct = sum(1 for t in self.trades if not t.closed)
        if open_ct >= MAX_OPEN: return False
        # Prevent trading in same market we already have a position in
        if any(not t.closed and t.mkt_q == self.mkt.q for t in self.trades):
            return False
        return True

    def _btc_delta(self, window_sec: float) -> Optional[float]:
        """BTC % change over last N seconds"""
        if not self.bnc_p or len(self.bnc_q) < 3: return None
        now = time.time()
        old = None
        for snap in self.bnc_q:
            if now - snap["t"] >= window_sec:
                old = snap["p"]; break
        if not old or old == 0: return None
        return (self.bnc_p - old) / old

    def _btc_period_delta(self) -> Optional[float]:
        """BTC % change since market opened"""
        if not self.mkt or self.mkt.btc_open == 0 or not self.bnc_p: return None
        return (self.bnc_p - self.mkt.btc_open) / self.mkt.btc_open

    def _poly_price_age(self, hist: deque, window_sec: float) -> Optional[float]:
        """Get oldest Poly price in window"""
        now = time.time()
        for snap in hist:
            if now - snap.ts >= window_sec:
                return snap.price
        return None

    def _check_signals(self):
        if not self._can_trade(): return
        sigs = []

        s1 = self._sig_momentum()
        if s1: sigs.append(s1)

        s2 = self._sig_mean_reversion()
        if s2: sigs.append(s2)

        s3 = self._sig_expiry()
        if s3: sigs.append(s3)

        self.signals_active = [s["name"] for s in sigs]

        # Execute best signal (highest estimated edge)
        if sigs:
            best = max(sigs, key=lambda s: s["edge"])
            self._execute_paper_trade(best)

    def _sig_momentum(self) -> Optional[dict]:
        """Signal 1: BTC moved significantly, Poly hasn't caught up"""
        btc_d = self._btc_delta(MOM_BTC_WINDOW)
        if btc_d is None: return None
        if abs(btc_d) < MOM_BTC_THRESH: return None

        up_bk = self.books.get(self.mkt.up_tid)
        if not up_bk: return None
        up_mid = up_bk.mid()
        if not up_mid: return None

        # Fair value model: BTC up → UP probability should increase
        # Simple linear model: 0.08% BTC move ≈ shift fair prob by ~0.15
        fair_shift = btc_d / MOM_BTC_THRESH * 0.15  # scale
        fair_up = 0.50 + fair_shift  # base 50/50 + shift
        fair_up = max(0.05, min(0.95, fair_up))

        if btc_d > 0:  # BTC going up
            gap = fair_up - up_mid
            if gap >= MOM_POLY_GAP:
                reason = (f"BTC moved {btc_d*100:+.3f}% in 60s → fair UP prob={fair_up:.2f}, "
                          f"but Poly UP only {up_mid:.4f} (gap={gap:.4f}). "
                          f"Buying UP: Binance leads, Poly hasn't caught up.")
                return {"name": "MOM↑", "dir": "UP", "price": up_mid,
                        "est_prob": fair_up, "edge": gap, "reason": reason}
        else:  # BTC going down
            fair_dn = 1.0 - fair_up
            dn_mid = 1.0 - up_mid
            gap = fair_dn - dn_mid
            if gap >= MOM_POLY_GAP:
                reason = (f"BTC moved {btc_d*100:+.3f}% in 60s → fair DOWN prob={fair_dn:.2f}, "
                          f"but Poly DOWN only {dn_mid:.4f} (gap={gap:.4f}). "
                          f"Buying DOWN: Binance leads, Poly hasn't caught up.")
                return {"name": "MOM↓", "dir": "DOWN", "price": dn_mid,
                        "est_prob": fair_dn, "edge": gap, "reason": reason}
        return None

    def _sig_mean_reversion(self) -> Optional[dict]:
        """Signal 2: Poly price dropped sharply without BTC explanation"""
        if len(self.up_hist) < 10: return None

        # Check UP token crash
        old_up = self._poly_price_age(self.up_hist, MR_DROP_WINDOW)
        if old_up:
            up_bk = self.books.get(self.mkt.up_tid)
            cur_up = up_bk.mid() if up_bk else None
            if cur_up and old_up - cur_up >= MR_DROP_THRESH:
                btc_d = self._btc_delta(MR_DROP_WINDOW)
                if btc_d is not None and abs(btc_d) < MR_BTC_CALM:
                    drop = old_up - cur_up
                    est_prob = old_up - drop * 0.3  # expect 70% recovery
                    edge = est_prob - cur_up
                    if edge > 0.03:
                        reason = (f"UP crashed {drop:.4f} in {MR_DROP_WINDOW}s ({old_up:.4f}→{cur_up:.4f}), "
                                  f"but BTC only moved {btc_d*100:+.3f}% (calm). "
                                  f"Liquidity cascade detected — buying UP for mean reversion to ~{est_prob:.4f}.")
                        return {"name": "MR↑", "dir": "UP", "price": cur_up,
                                "est_prob": est_prob, "edge": edge, "reason": reason}

        # Check DOWN token crash
        old_dn = self._poly_price_age(self.dn_hist, MR_DROP_WINDOW)
        if old_dn:
            dn_bk = self.books.get(self.mkt.dn_tid)
            cur_dn = dn_bk.mid() if dn_bk else None
            if cur_dn and old_dn - cur_dn >= MR_DROP_THRESH:
                btc_d = self._btc_delta(MR_DROP_WINDOW)
                if btc_d is not None and abs(btc_d) < MR_BTC_CALM:
                    drop = old_dn - cur_dn
                    est_prob = old_dn - drop * 0.3
                    edge = est_prob - cur_dn
                    if edge > 0.03:
                        reason = (f"DOWN crashed {drop:.4f} in {MR_DROP_WINDOW}s ({old_dn:.4f}→{cur_dn:.4f}), "
                                  f"but BTC only moved {btc_d*100:+.3f}% (calm). "
                                  f"Liquidity cascade detected — buying DOWN for mean reversion to ~{est_prob:.4f}.")
                        return {"name": "MR↓", "dir": "DOWN", "price": cur_dn,
                                "est_prob": est_prob, "edge": edge, "reason": reason}
        return None

    def _sig_expiry(self) -> Optional[dict]:
        """Signal 3: Near expiry, price hasn't converged to BTC trend"""
        if not self.mkt or self.mkt.ttl > EX_TIME_WINDOW: return None
        if self.mkt.ttl < MIN_EXPIRY: return None  # too close

        pd = self._btc_period_delta()
        if pd is None: return None
        if abs(pd) < EX_BTC_TREND: return None

        up_bk = self.books.get(self.mkt.up_tid)
        if not up_bk: return None
        up_mid = up_bk.mid()
        if not up_mid: return None
        sp = up_bk.sp()
        if sp and sp > 0.05: return None  # spread too wide

        ttl_min = self.mkt.ttl / 60

        if pd > 0:  # BTC trending UP for the period
            if up_mid < EX_UNDERPRICED:
                ttl_factor = max(0.5, 1.0 - self.mkt.ttl / EX_TIME_WINDOW)
                est_prob = 0.70 + ttl_factor * 0.20  # 70-90% based on time
                edge = est_prob - up_mid
                if edge > 0.03:
                    reason = (f"Expiry in {ttl_min:.1f}min. BTC period delta={pd*100:+.3f}% (UP trend), "
                              f"but UP only priced {up_mid:.4f} (should be >{EX_UNDERPRICED}). "
                              f"Time decay: est prob={est_prob:.2f}, edge={edge:.4f}. "
                              f"BTC ${self.bnc_p:,.2f} vs open ${self.mkt.btc_open:,.2f}.")
                    return {"name": "EXP↑", "dir": "UP", "price": up_mid,
                            "est_prob": est_prob, "edge": edge, "reason": reason}
        else:  # BTC trending DOWN
            dn_mid = 1.0 - up_mid
            if dn_mid < EX_UNDERPRICED:
                ttl_factor = max(0.5, 1.0 - self.mkt.ttl / EX_TIME_WINDOW)
                est_prob = 0.70 + ttl_factor * 0.20
                edge = est_prob - dn_mid
                if edge > 0.03:
                    reason = (f"Expiry in {ttl_min:.1f}min. BTC period delta={pd*100:+.3f}% (DOWN trend), "
                              f"but DOWN only priced {dn_mid:.4f} (should be >{EX_UNDERPRICED}). "
                              f"Time decay: est prob={est_prob:.2f}, edge={edge:.4f}. "
                              f"BTC ${self.bnc_p:,.2f} vs open ${self.mkt.btc_open:,.2f}.")
                    return {"name": "EXP↓", "dir": "DOWN", "price": dn_mid,
                            "est_prob": est_prob, "edge": edge, "reason": reason}
        return None

    # ── Execute ──
    def _execute_paper_trade(self, sig: dict):
        size = kelly_size(sig["est_prob"], sig["price"], self.bal)
        if size < 1:
            return  # too small
        self.bal -= size
        edge = sig["est_prob"] - sig["price"]
        target_p = sig["price"] + edge * TP_PCT   # take profit at 60% of edge
        stop_p = max(0.01, sig["price"] - edge * SL_PCT)  # stop loss
        t = Trade(dir=sig["dir"], signal=sig["name"], entry=sig["price"],
                  size=size, ts=time.time(), mkt_q=self.mkt.q,
                  kelly_f=size / self.bal if self.bal > 0 else 0,
                  est_prob=sig["est_prob"],
                  target_p=target_p,
                  stop_p=stop_p,
                  reason=sig.get("reason", ""))
        self.trades.append(t)
        self.last_trade_ts = time.time()
        self._log_trade(t, "OPEN")

    # ── Exit Management ──
    def _check_exits(self):
        """Check open positions for take-profit or stop-loss"""
        for t in self.trades:
            if t.closed: continue
            # Get current price of the token we bought
            if t.dir == "UP":
                bk = self.books.get(self.mkt.up_tid) if self.mkt else None
            else:
                bk = self.books.get(self.mkt.dn_tid) if self.mkt else None
            if not bk: continue
            cur_price = bk.mid()
            if not cur_price: continue

            # For DOWN trades, current price is 1 - UP mid
            if t.dir == "DOWN" and self.mkt:
                up_bk = self.books.get(self.mkt.up_tid)
                if up_bk and up_bk.mid():
                    cur_price = 1.0 - up_bk.mid()

            # Take Profit
            if cur_price >= t.target_p:
                self._close_trade(t, cur_price, "TAKE_PROFIT",
                    f"Price reached target {t.target_p:.4f} (cur={cur_price:.4f}). "
                    f"Entry {t.entry:.4f} → Exit {cur_price:.4f}")
                continue

            # Stop Loss
            if cur_price <= t.stop_p:
                self._close_trade(t, cur_price, "STOP_LOSS",
                    f"Price hit stop {t.stop_p:.4f} (cur={cur_price:.4f}). "
                    f"Entry {t.entry:.4f} → Exit {cur_price:.4f}")
                continue

    def _close_trade(self, t: Trade, exit_price: float, exit_reason: str, detail: str):
        """Close a trade at a specific price (not resolution)"""
        shares = t.size / t.entry
        payout = shares * exit_price
        t.pnl = payout - t.size
        t.exit_p = exit_price
        t.exit_reason = exit_reason
        t.closed = True
        t.outcome = exit_reason
        self.bal += payout  # get back size + profit (or reduced amount if loss)
        self._log_trade(t, f"CLOSED:{exit_reason}")

    # ── CSV Log ──
    def _log_trade(self, t: Trade, status: str):
        """Append trade to CSV log file"""
        file_exists = os.path.isfile(LOG_FILE)
        try:
            with open(LOG_FILE, "a", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                if not file_exists:
                    w.writerow(["timestamp", "status", "signal", "direction", "market",
                                "entry_price", "exit_price", "size_usd", "est_prob",
                                "kelly_frac", "edge", "pnl", "balance", "outcome", "reason"])
                w.writerow([
                    datetime.fromtimestamp(t.ts).strftime("%Y-%m-%d %H:%M:%S"),
                    status,
                    t.signal,
                    t.dir,
                    t.mkt_q,
                    f"{t.entry:.6f}",
                    f"{t.exit_p:.4f}" if t.exit_p is not None else "",
                    f"{t.size:.2f}",
                    f"{t.est_prob:.4f}",
                    f"{t.kelly_f:.4f}",
                    f"{t.est_prob - t.entry:.4f}",
                    f"{t.pnl:+.2f}" if t.closed else "",
                    f"{self.bal:.2f}",
                    t.outcome,
                    t.reason
                ])
        except Exception as e:
            log.warning(f"Log write error: {e}")

    # ── Resolution ──
    def _resolve_market(self):
        """Resolve trades when market expires: fetch exact Binance 15m kline."""
        if not self.mkt: return

        # Fetch the EXACT 15m Binance kline for this market's window
        mkt_start_ts = self.mkt.end_ts - 900  # 15 min market
        kline = fetch_btc_15m_kline(mkt_start_ts)

        if kline:
            btc_open = kline["open"]
            btc_close = kline["close"]
        else:
            # Fallback: use stored open + current price (less accurate)
            btc_open = self.mkt.btc_open
            btc_close = self.bnc_p if self.bnc_p else 0

        if btc_open == 0 or btc_close == 0: return

        outcome = "UP" if btc_close >= btc_open else "DOWN"
        self.results.append(outcome)

        for t in self.trades:
            if t.closed: continue
            if t.mkt_q != self.mkt.q: continue
            if t.dir == outcome:
                # Winner: pays $1 per share
                shares = t.size / t.entry
                payout = shares * 1.0
                t.pnl = payout - t.size
                t.exit_p = 1.0
            else:
                # Loser: pays $0
                t.pnl = -t.size
                t.exit_p = 0.0
            t.closed = True
            t.outcome = outcome
            self.bal += t.size + t.pnl
            self._log_trade(t, "CLOSED")

    # ── Rotation ──
    async def _rot(self):
        while self.on:
            await asyncio.sleep(5)
            if not self.on: break
            need = False
            if self.mkt and self.mkt.ttl <= 0:
                # Market has ended — wait 10s for Binance kline to finalize
                await asyncio.sleep(10)
                need = True
            if time.time() - self.lr > REFRESH_SEC:
                need = True
            if need:
                self.refresh()

    # ── Display ──
    async def _ui(self):
        await asyncio.sleep(4)
        while self.on:
            self._dash()
            await asyncio.sleep(DASH_SEC)

    def _dash(self):
        L = []
        W = 72
        if os.name == "nt": os.system("cls")

        # Title
        L.append("  POLYMARKET PAPER TRADER v4 — Multi-Signal")
        L.append("=" * W)

        # Market
        if self.mkt:
            L.append(f"  MARKET: {self.mkt.q}")
            L.append(f"  TTL: {self.mkt.ttl_str}   |   {datetime.now().strftime('%H:%M:%S')}   |   "
                     f"BTC Open: ${self.mkt.btc_open:,.2f}" if self.mkt.btc_open else
                     f"  TTL: {self.mkt.ttl_str}   |   {datetime.now().strftime('%H:%M:%S')}")
        else:
            L.append("  MARKET: [searching...]")
        L.append("-" * W)

        # Prices
        btc = f"${self.bnc_p:,.2f}" if self.bnc_p else "---"
        btc_d60 = self._btc_delta(60)
        btc_d_str = f"{btc_d60*100:+.3f}%" if btc_d60 else "---"
        pd = self._btc_period_delta()
        pd_str = f"{pd*100:+.3f}%" if pd else "---"
        L.append(f"  BTC: {btc}   Δ60s: {btc_d_str}   Period: {pd_str}")

        # Poly prices + orderbook
        if self.mkt:
            ub = self.books.get(self.mkt.up_tid)
            db = self.books.get(self.mkt.dn_tid)
            um = ub.mid() if ub else None
            dm = db.mid() if db else None
            sp = ub.sp() if ub else None
            L.append(f"  UP: {f'{um:.4f}' if um else '---':>8s}   "
                     f"DOWN: {f'{dm:.4f}' if dm else '---':>8s}   "
                     f"Spread: {f'{sp:.4f}' if sp else '---'}")
            if ub and (ub.bids or ub.asks):
                L.append("")
                L.append("  ┌──── UP Book ─────────────────────────────────────────┐")
                for p, s in ub.depth("ask", 3):
                    bar = "█" * min(int(s / 10), 30)
                    L.append(f"  │ ASK {p:.4f}  {s:>8.1f}  {bar}")
                L.append(f"  │{'─' * 53}│")
                for p, s in ub.depth("bid", 3):
                    bar = "█" * min(int(s / 10), 30)
                    L.append(f"  │ BID {p:.4f}  {s:>8.1f}  {bar}")
                L.append("  └─────────────────────────────────────────────────────┘")

        L.append("-" * W)

        # Signals
        sigs = ", ".join(self.signals_active) if self.signals_active else "none active"
        L.append(f"  SIGNALS: [{sigs}]")

        # Portfolio
        open_trades = [t for t in self.trades if not t.closed]
        closed_trades = [t for t in self.trades if t.closed]
        realized = sum(t.pnl for t in closed_trades)
        unrealized = 0
        if self.mkt and open_trades:
            ub = self.books.get(self.mkt.up_tid)
            if ub:
                cur_up = ub.mid()
                if cur_up:
                    for t in open_trades:
                        if t.dir == "UP":
                            shares = t.size / t.entry
                            unrealized += shares * cur_up - t.size
                        else:
                            shares = t.size / t.entry
                            unrealized += shares * (1 - cur_up) - t.size
        equity = self.bal + sum(t.size for t in open_trades) + unrealized
        wins = sum(1 for t in closed_trades if t.pnl > 0)
        losses = sum(1 for t in closed_trades if t.pnl <= 0)
        wr = f"{wins/(wins+losses)*100:.0f}%" if (wins + losses) > 0 else "---"

        L.append(f"  PORTFOLIO  Cash: ${self.bal:>7.2f}  Equity: ${equity:>7.2f}  Start: ${STARTING_BAL:.2f}")
        L.append(f"  P&L  Realized: ${realized:>+7.2f}  Unrealized: ${unrealized:>+7.2f}  "
                 f"WR: {wr} ({wins}W/{losses}L)")
        L.append(f"  Positions: {len(open_trades)} open / {len(closed_trades)} closed")

        # Open positions with TP/SL
        if open_trades:
            L.append("")
            for t in open_trades:
                u = 0
                cur = None
                if self.mkt:
                    ub = self.books.get(self.mkt.up_tid)
                    if ub:
                        c = ub.mid()
                        if c:
                            cur = c if t.dir == "UP" else (1 - c)
                            sh = t.size / t.entry
                            u = sh * cur - t.size
                cur_str = f"{cur:.4f}" if cur else "---"
                L.append(f"  ► {t.signal} {t.dir} @{t.entry:.4f} → now {cur_str}  "
                         f"TP:{t.target_p:.4f} SL:{t.stop_p:.4f}  ${u:>+.2f}")

        L.append("-" * W)

        # Trade Log
        L.append(f"  TRADE LOG (last 10)   |   Outcomes: {' '.join(self.results[-10:]) if self.results else '---'}")
        L.append(f"  Log file: {LOG_FILE}")
        if self.trades:
            for t in self.trades[-10:]:
                ts = datetime.fromtimestamp(t.ts).strftime("%H:%M:%S")
                if t.closed:
                    ex = t.exit_reason[:7] if t.exit_reason else "RESOLVD"
                    st = f"${t.pnl:>+.2f} [{ex}]"
                else:
                    st = "OPEN"
                L.append(f"    {ts} {t.signal:>5s} {t.dir:>4s} @{t.entry:.3f} "
                         f"${t.size:.1f} [{st}]")
        else:
            L.append("    [waiting for signals...]")

        L.append("-" * W)
        rt = time.time() - self.t0
        L.append(f"  WS: P[{'OK' if self.p_ok else 'X '}]({self.p_n})  "
                 f"B[{'OK' if self.b_ok else 'X '}]({self.b_n})  |  "
                 f"Run: {int(rt//60)}m{int(rt%60):02d}s  |  Ctrl+C")
        L.append("=" * W)
        print("\n".join(L))

    # ── Shutdown ──
    def stop(self):
        self.on = False
        self._resolve_market()
        print()
        print("=" * 72)
        print("  SESSION SUMMARY")
        print("=" * 72)
        rt = time.time() - self.t0
        cl = [t for t in self.trades if t.closed]
        op = [t for t in self.trades if not t.closed]
        realized = sum(t.pnl for t in cl)
        wins = sum(1 for t in cl if t.pnl > 0)
        losses = len(cl) - wins
        print(f"  Runtime: {int(rt//60)}m {int(rt%60)}s")
        print(f"  Start: ${STARTING_BAL:.2f}   Final Cash: ${self.bal:.2f}")
        print(f"  Realized P&L: ${realized:+.2f}")
        print(f"  Win Rate: {wins}W / {losses}L ({wins/(wins+losses)*100:.0f}%)" if (wins+losses) else "  No closed trades")
        print(f"  Outcomes: {' '.join(self.results)}")
        if self.trades:
            print()
            print(f"  {'Time':>8s} {'Sig':>5s} {'Dir':>4s} {'Entry':>7s}  {'Exit':>5s}  {'P&L':>7s}  {'Status'}")
            print("  " + "-" * 60)
            for t in self.trades:
                ts = datetime.fromtimestamp(t.ts).strftime("%H:%M:%S")
                ex = f"{t.exit_p:.2f}" if t.exit_p is not None else " --- "
                pnl = f"${t.pnl:>+.2f}" if t.closed else "  --- "
                st = "CLOSED" if t.closed else " OPEN "
                print(f"  {ts:>8s} {t.signal:>5s} {t.dir:>4s} {t.entry:>7.4f}  {ex:>5s}  {pnl:>7s}  {st}")
        print("=" * 72)


async def main():
    bot = Bot()
    try:
        await bot.run()
    except KeyboardInterrupt:
        bot.stop()
    except asyncio.CancelledError:
        bot.stop()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped.")
