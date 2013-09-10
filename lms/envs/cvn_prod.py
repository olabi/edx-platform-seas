from .aws import *

INSTALLED_APPS += ('wind','cvn')
FORCE_SCRIPT_NAME = ENV_TOKENS.get("FORCE_SCRIPT_NAME")
WIND_LOGIN_URL = ENV_TOKENS.get("WIND_LOGIN_URL")
WIND_DESTINATION = ENV_TOKENS.get("WIND_DESTINATION")
WIND_VALIDATION = ENV_TOKENS.get("WIND_VALIDATION")
CMS_URL = ENV_TOKENS.get("CMS_URL")
LTI_LAUNCH_URL = ENV_TOKENS.get("LTI_LAUNCH_URL")
LTI_CONSUMER_KEY = ENV_TOKENS.get("LTI_CONSUMER_KEY")
LTI_CONSUMER_SECRET = ENV_TOKENS.get("LTI_CONSUMER_SECRET")
CVN_SC_URL = ENV_TOKENS.get("CVN_SC_URL")
