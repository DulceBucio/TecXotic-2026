from pymavlink import mavutil
import os
import sys
import logging 
import time

''' Navigator connection '''
MAVLINK_URL = os.getenv('MAVLINK_URL', 'tcp:127.0.0.1:5777')
logger = logging.getLogger(__name__)

class Navigator:
    ''' Navigator connection and operation management'''
    def __init__(self, thrusters=8):
        self.thrusters=thrusters
        logger.info(MAVLINK_URL)
        try:
            logger.info('Trying to get heartbeat...')
            self.navigator_board = mavutil.mavlink_connection(MAVLINK_URL)
            self.navigator_board.wait_heartbeat()
            logger.info('Heartbeat received')
        except Exception as e:
            logger.error(f'Error in connecting to Navigator: {e}')
            sys.exit(1)
        self.disarm()
        self.change_mode('MANUAL')

    def arm(self):
        ''' Set up thrusters (necessary for any movement) '''
        logger.info('Arming motors...')
        self.navigator_board.arducopter_arm()
        self.navigator_board.motors_armed_wait()
        logger.info('MOTORS ARMED')

    def disarm(self):
        ''' Turn off thrusters '''
        logger.info('Disarming motors...')
        self.navigator_board.arducopter_disarm()
        self.navigator_board.motors_disarmed_wait()
        logger.info('MOTORS DISARMED')

    def change_mode(self, mode):
        mode = mode.upper()
        ''' Sets autopilot mode by id '''
        if mode not in self.navigator_board.mode_mapping():
            logger.error('Unknown mode')
            sys.exit(1)

        mode_id = self.navigator_board.mode_mapping()[mode]
        self.navigator_board.set_mode(mode_id)

    # pitch/forward, roll/lateral, throttle, yaw
    def drive_manual(self, x, y, z, r, buttons):
        ## TODO
        logger.info('Enabling motion through manual mode')
        logger.info(f'Pitch/Forward: {x}, Roll/Lateral: {y}, Throttle: {z}, Yaw: {r}')
        self.navigator_board.mav.manual_control_send(
            self.navigator_board.target_system, 
            x, y, z, r, buttons
        )

    def send_rc(self, rcin1=65535, rcin2=65535, rcin3=65535, rcin4=65535,
                rcin5=65535, rcin6=65535, rcin7=65535, rcin8=65535,
                rcin9=65535, rcin10=65535, rcin11=65535, rcin12=65535,
                rcin13=65535, rcin14=65535, rcin15=65535, rcin16=65535,
                rcin17=65535, rcin18=65535, *, # keyword-only from here
                pitch=None, roll=None, throttle=None, yaw=None, forward=None,
                lateral=None, camera_pan=None, camera_tilt=None, lights1=None,
                lights2=None, video_switch=None):
        
        ''' Sets all 18 rc channels as specified.
        Values should be between 1100-1900, or left as 65535 to ignore.
        Can specify values:
            positionally,
            or with rcinX (X=1-18),
            or with default RC Input channel mapping names
              -> see https://ardusub.com/developers/rc-input-and-output.html
        It's possible to mix and match specifier types (although generally
          not recommended). Default channel mapping names override positional
          or rcinX specifiers.
        '''

        rc_channel_values = (
            pitch        or rcin1,
            roll         or rcin2,
            throttle     or rcin3,
            yaw          or rcin4,
            forward      or rcin5,
            lateral      or rcin6,
            camera_pan   or rcin7,
            camera_tilt  or rcin8,
            lights1      or rcin9,
            lights2      or rcin10,
            video_switch or rcin11,
            rcin12, rcin13, rcin14, rcin15, rcin16, rcin17, rcin18
        )
        logger.info(f'Enabling motion through RC channels')
        logger.info(rc_channel_values)
        self.navigator_board.mav.rc_channels_override_send(
            self.navigator_board.target_system,
            self.navigator_board.target_component,
            *rc_channel_values
        )


    def clear_motion(self, stopped_pwm=1500):
        ''' Set 6 RC motion channels to a stopped value '''
        logger.info('Clearing motion')
        self.send_rc(*[stopped_pwm]*6)

    def get_thruster_outputs(self):
        ''' Returns (and notes) the first 'self.thrusters' servo PWM values.
        Offset by 1500 to make it clear how each thruster is active.
        '''
        logger.debug('get_thruster_outputs')
        servo_outputs = self.navigator_board.recv_match(type='SERVO_OUTPUT_RAW',
                                        blocking=True).to_dict()
        thruster_outputs = [servo_outputs[f'servo{i+1}_raw'] - 1500
                            for i in range(self.thrusters)]
        logger.info(f'{thruster_outputs=}')
        return thruster_outputs

    
## TESTING AS A SCRIPT
if __name__ == '__main__':
    navigator = Navigator()
    navigator.change_mode('MANUAL')
    navigator.arm()

    try:
        while True:
            navigator.drive_manual(500, -500, 250, 500, 0)
            time.sleep(0.1)
    except KeyboardInterrupt:
        navigator.clear_motion()
        navigator.disarm()
