import logging
from gpiozero import DigitalOutputDevice

logger = logging.getLogger(__name__)

''' Tool setup '''
PIN_OPEN = 17
PIN_CLOSE = 27
gripper_open = DigitalOutputDevice(PIN_OPEN)
gripper_close = DigitalOutputDevice(PIN_CLOSE)

class Tool:
    def __init__(self):
        logger.info('Tool initialized')

    def gripper_stop(self):
        gripper_open.off()
        gripper_close.off()

    def control_gripper(self, action: str):
        if action == 'open':
            self.gripper_stop()
            gripper_open.on()
        elif action == 'close':
            self.gripper_stop()
            gripper_close.on()
        elif action == 'stop':
            self.gripper_stop()
        else: 
            logger.error(f'Unknown gripper action: {action}')