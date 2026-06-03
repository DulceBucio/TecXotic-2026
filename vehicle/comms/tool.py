import logging
from comms.mavactive import mavutil

logger = logging.getLogger(__name__)

GRIPPER_CHANNEL = 10
ROLL_CHANNEL    = 11

GRIPPER_OPEN_LIMIT  = 2100
GRIPPER_CLOSE_LIMIT = 1100
GRIPPER_NEUTRAL     = 1600

ROLL_LEFT_LIMIT  = 2100
ROLL_RIGHT_LIMIT = 1100
ROLL_NEUTRAL     = 1600

STEP = 50

class Tool:
    def __init__(self, navigator_board):
        self.navigator_board = navigator_board
        self.gripper_pwm = GRIPPER_NEUTRAL
        self.roll_pwm    = ROLL_NEUTRAL
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
            self.gripper_pwm = min(self.gripper_pwm + STEP, GRIPPER_OPEN_LIMIT)
            self._set_servo(GRIPPER_CHANNEL, self.gripper_pwm)
            logger.info(f'Claw opening: {self.gripper_pwm}')

        elif action == 'close':
            self.gripper_pwm = max(self.gripper_pwm - STEP, GRIPPER_CLOSE_LIMIT)
            self._set_servo(GRIPPER_CHANNEL, self.gripper_pwm)
            logger.info(f'Claw closing: {self.gripper_pwm}')

        elif action == 'left-roll':
            self.roll_pwm = min(self.roll_pwm + STEP, ROLL_LEFT_LIMIT)
            self._set_servo(ROLL_CHANNEL, self.roll_pwm)
            logger.info(f'Rolling left: {self.roll_pwm}')

        elif action == 'right-roll':
            self.roll_pwm = max(self.roll_pwm - STEP, ROLL_RIGHT_LIMIT)
            self._set_servo(ROLL_CHANNEL, self.roll_pwm)
            logger.info(f'Rolling right: {self.roll_pwm}')

        elif action == 'stop':
            self._set_servo(GRIPPER_CHANNEL, self.gripper_pwm)
            self._set_servo(ROLL_CHANNEL, self.roll_pwm)
            logger.info('Servos holding position')

        else:
            logger.error(f'Unknown gripper action: {action}')