import logging

logger = logging.getLogger(__name__)

class PDHPDLStrategy:
    def __init__(self, volume_multiplier=1.3, near_pct=0.25):
        self.volume_multiplier = volume_multiplier
        self.near_pct = near_pct / 100
        
        self.pdh = {}
        self.pdl = {}
        self.ema20 = {}
        self.ema50 = {}
        self.avg_volume = {}
        
        self.signals = []

    def update_daily_levels(self, symbol: str, daily_df):
        """
        Call this with previous day data
        daily_df should have columns: high, low, close, volume
        """
        if len(daily_df) < 2:
            return
        
        prev = daily_df.iloc[-2]
        self.pdh[symbol] = prev['high']
        self.pdl[symbol] = prev['low']
        
        closes = daily_df['close']
        self.ema20[symbol] = closes.ewm(span=20, adjust=False).mean().iloc[-1]
        self.ema50[symbol] = closes.ewm(span=50, adjust=False).mean().iloc[-1]
        
        self.avg_volume[symbol] = daily_df['volume'].tail(10).mean()

    def check_signal(self, tick: dict):
        symbol = tick['symbol']
        ltp = tick['ltp']
        vol = tick['volume']
        
        if symbol not in self.pdh:
            return None
        
        pdh = self.pdh[symbol]
        pdl = self.pdl[symbol]
        ema20 = self.ema20.get(symbol, 0)
        ema50 = self.ema50.get(symbol, 0)
        avg_vol = self.avg_volume.get(symbol, 1)
        
        vol_ratio = vol / avg_vol if avg_vol > 0 else 0
        
        ema_bullish = ltp > ema20 > ema50
        ema_bearish = ltp < ema20 < ema50
        
        signal = None
        
        # Bullish signal
        if ltp > pdh and vol_ratio >= self.volume_multiplier and ema_bullish:
            signal = {
                'symbol': symbol,
                'side': 'BULLISH',
                'ltp': ltp,
                'pdh': pdh,
                'pdl': pdl,
                'vol_ratio': round(vol_ratio, 2),
                'ema20': round(ema20, 2),
                'ema50': round(ema50, 2),
                'strength': min(100, int(50 + (vol_ratio-1)*30))
            }
        
        # Bearish signal
        elif ltp < pdl and vol_ratio >= self.volume_multiplier and ema_bearish:
            signal = {
                'symbol': symbol,
                'side': 'BEARISH',
                'ltp': ltp,
                'pdh': pdh,
                'pdl': pdl,
                'vol_ratio': round(vol_ratio, 2),
                'ema20': round(ema20, 2),
                'ema50': round(ema50, 2),
                'strength': min(100, int(50 + (vol_ratio-1)*30))
            }
        
        if signal:
            self.signals.append(signal)
            logger.info(f"SIGNAL → {signal['side']} | {symbol} @ {ltp}")
        
        return signal
