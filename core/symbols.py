import requests
import zipfile
import io
import pandas as pd
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class SymbolMaster:
    def __init__(self, data_dir="data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)
        
        self.nse_url = "https://api.shoonya.com/NSE_symbols.txt.zip"
        self.nfo_url = "https://api.shoonya.com/NFO_symbols.txt.zip"

    def download_and_extract(self, url, filename):
        logger.info(f"Downloading {filename}...")
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            z.extractall(self.data_dir)
        
        logger.info(f"Extracted {filename}")

    def load_nse(self):
        path = self.data_dir / "NSE_symbols.txt"
        if not path.exists():
            self.download_and_extract(self.nse_url, "NSE_symbols")
        
        df = pd.read_csv(path)
        return df

    def load_nfo(self):
        path = self.data_dir / "NFO_symbols.txt"
        if not path.exists():
            self.download_and_extract(self.n
