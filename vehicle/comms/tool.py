import logging
from comms.mavactive import mavutil, mavlink

logger = logging.getLogger(__name__)

RELAY_OPEN  = 0  # RELAY1 → pin 10
RELAY_CLOSE = 1  # RELAY2 → pin 11

class Tool:
    def __init__(self, navigator_board):
        self.navigator_board = navigator_board
        logger.info('Tool initialized')

    def _set_relay(self, relay_index: int, state: int):
        self.navigator_board.mav.command_long_send(
            self.navigator_board.target_system,
            self.navigator_board.target_component,
            mavutil.mavlink.MAV_CMD_DO_SET_RELAY,
            0,
            relay_index,
            state,
            0, 0, 0, 0, 0
        )

    def gripper_stop(self):
        self._set_relay(RELAY_OPEN, 0)
        self._set_relay(RELAY_CLOSE, 0)
        logger.info('Claw stopped')

    def control_gripper(self, action: str):
        if action == 'open':
            self.gripper_stop()
            self._set_relay(RELAY_OPEN, 1)
            logger.info('Claw open')
        elif action == 'close':
            self.gripper_stop()
            self._set_relay(RELAY_CLOSE, 1)
            logger.info('Claw closed')
        elif action == 'stop':
            self.gripper_stop()
        else:
            logger.error(f'Unknown gripper action: {action}')