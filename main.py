import time
import logging
from core.auth import ShoonyaAuth
from core.symbols import SymbolMaster
from core.feed import LiveFeed
from core.strategy import PDHPDLStrategy

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s'
)
logger = logging.getLogger(__name__)

def on_tick(tick):
    signal = strategy.check_signal(tick)
    # Later we can add Telegram / UI alerts here

if __name__ == "__main__":
    # 1. Login
    auth = ShoonyaAuth()
    if not auth.login():
        raise Exception("Login failed")

    api = auth.get_api()

    # 2. Load F&O universe
    sm = SymbolMaster()
    universe = sm.get_fno_equity_universe()
    token_map = sm.get_token_map()
    
    logger.info(f"Loaded {len(token_map)} F&O stocks")

    # 3. Strategy engine
    strategy = PDHPDLStrategy(volume_multiplier=1.3)

    # 4. Start live feed
    feed = LiveFeed(api, token_map)
    feed.start(on_tick=on_tick)

    logger.info("Live scanner running... Press Ctrl+C to stop")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Scanner stopped by user")
