import yaml
import pyotp
from NorenRestApiPy.NorenApi import NorenApi
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ShoonyaAuth:
    def __init__(self, cred_path="config/cred.yml"):
        with open(cred_path) as f:
            self.cred = yaml.safe_load(f)
        
        self.api = NorenApi(
            host='https://api.shoonya.com/NorenWClientTP/',
            websocket='wss://api.shoonya.com/NorenWSTP/'
        )
        self.session = None

    def login(self):
        factor2 = self.cred['factor2']
        
        # Auto TOTP if secret is long
        if len(str(factor2)) > 10:
            factor2 = pyotp.TOTP(factor2).now()
        
        ret = self.api.login(
            userid=self.cred['user'],
            password=self.cred['pwd'],
            twoFA=factor2,
            vendor_code=self.cred['vc'],
            api_secret=self.cred['apikey'],
            imei=self.cred['imei']
        )
        
        if ret and ret.get('stat') == 'Ok':
            self.session = ret
            logger.info(f"Login successful | User: {ret.get('uname')}")
            return True
        else:
            logger.error(f"Login failed: {ret}")
            return False

    def get_api(self):
        return self.api
