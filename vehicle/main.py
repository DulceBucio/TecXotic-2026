from config.logging import setup_logging
from comms.server import run as websocket_server

setup_logging()

if __name__=='__main__':
    websocket_server()