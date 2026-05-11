import logging
from comms.mavactive import mavutil

logger = logging.getLogger(__name__)

GRIPPER_CHANNEL = 10
ROLL_CHANNEL = 11
SERVO_OPEN    = 1900
SERVO_CLOSE   = 1100
SERVO_NEUTRAL = 1500

class Tool:
    def __init__(self, navigator_board):
        self.navigator_board = navigator_board
        logger.info('Tool initialized')

    def _set_servo(self, channel: int, pwm: int):
        self.navigator_board.mav.command_long_send(
            self.navigator_board.target_system,
            self.navigator_board.target_component,
            mavutil.mavlink.MAV_CMD_DO_SET_SERVO,
            0,
            channel,
            pwm,
            0, 0, 0, 0, 0
        )

    def control_gripper(self, action: str):
        if action == 'open':
            self._set_servo(GRIPPER_CHANNEL, SERVO_OPEN)
            logger.info('Claw open')
        elif action == 'close':
            self._set_servo(GRIPPER_CHANNEL, SERVO_CLOSE)
            logger.info('Claw closed')
        elif action == 'left-roll':
            self._set_servo(ROLL_CHANNEL, SERVO_OPEN)
            logger.info('Left roll applied')
        elif action == 'right-roll':
            self._set_servo(ROLL_CHANNEL, SERVO_CLOSE)
            logger.info('Right roll applied')
        elif action == 'stop':
            self._set_servo(GRIPPER_CHANNEL, SERVO_NEUTRAL)
            logger.info('Claw stopped')
        else:
            logger.error(f'Unknown gripper action: {action}')