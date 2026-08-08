import logging
from typing import Callable, Dict

logger = logging.getLogger(__name__)

class LiveFeed:
    def __init__(self, api, token_map: Dict[str, str]):
        self.api = api
        self.token_map = token_map
        self.reverse_map = {v: k for k, v in token_map.items()}
        self.ltp_data = {}
        self.on_tick_callback = None

    def _on_quote_update(self, message):
        try:
            if message.get('t') == 'tf':
                token = str(message.get('tk'))
                symbol = self.reverse_map.get(token)
                
                if symbol:
                    tick = {
                        'symbol': symbol,
                        'token': token,
                        'ltp': float(message.get('lp', 0)),
                        'volume': float(message.get('v', 0)),
                        'open': float(message.get('o', 0)),
                        'high': float(message.get('h', 0)),
                        'low': float(message.get('l', 0)),
                        'close': float(message.get('c', 0)),
                        'pc': float(message.get('pc', 0)),
                        'ap': float(message.get('ap', 0)),
                    }
                    self.ltp_data[symbol] = tick
                    
                    if self.on_tick_callback:
                        self.on_tick_callback(tick)
        except Exception as e:
            logger.error(f"Tick processing error:
