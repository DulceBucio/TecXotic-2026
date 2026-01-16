from pymavlink import mavutil
import os
import sys
import logging 
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

''' Navigator connection '''
MAVLINK_URL = os.getenv('MAVLINK_URL', 'udpin:0.0.0.0:14550')

class Navigator:
    ''' Navigator connection and operation management'''
    def __init__(self, thrusters=8):
        self.thrusters=thrusters
        try:
            self.navigator_board = mavutil.mavlink_connection(MAVLINK_URL)
            self.navigator_board.wait_heartbeat()
        except Exception as e:
            logging.error('Error in connecting to Navigator')
            sys.exit(1)
        self.disarm()
        self.change_mode('MANUAL')

    def arm(self):
        ''' Set up thrusters (necessary for any movement) '''
        logging.info('Arming motors...')
        self.navigator_board.arducopter_arm()
        self.navigator_board.motors_armed_wait()
        logging.info('MOTORS ARMED')

    def disarm(self):
        ''' Turn off thrusters '''
        logging.info('Disarming motors...')
        self.navigator_board.arducopter_disarm()
        self.navigator_board.motors_disarmed_wait()
        logging.info('MOTORS DISARMED')

    def change_mode(self, mode):
        mode = mode.upper()
        ''' Sets autopilot mode by id '''
        if mode not in self.navigator_board.mode_mapping():
            logging.error('Unknown mode')
            sys.exit(1)

        mode_id = self.navigator_board.mode_mapping()[mode]
        self.navigator_board.set_mode(mode_id)

    # def drive_manual(self, pitch, roll, throttle, yaw, forward, lateral):
    #     ## TODO
    #     self.navigator_board.rc_channels_override_send(
    #         self.navigator_board.target_system, 
    #         self.navigator_board.target_component,
    #         pitch, roll, throttle, yaw, forward, lateral
    #     )

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
        logging.info(f'send_rc')
        logging.debug(rc_channel_values)
        self.navigator_board.rc_channels_override_send(
            *self.navigator_board.target,
            *rc_channel_values
        )


    def clear_motion(self, stopped_pwm=1500):
        ''' Set 6 RC motion channels to a stopped value '''
        logging.info('Clearing motion')
        self.send_rc(*[stopped_pwm]*6)

    def get_thruster_outputs(self):
        ''' Returns (and notes) the first 'self.thrusters' servo PWM values.
        Offset by 1500 to make it clear how each thruster is active.
        '''
        logging.debug('get_thruster_outputs')
        servo_outputs = self.navigator_board.recv_match(type='SERVO_OUTPUT_RAW',
                                        blocking=True).to_dict()
        thruster_outputs = [servo_outputs[f'servo{i+1}_raw'] - 1500
                            for i in range(self.thrusters)]
        logging.info(f'{thruster_outputs=}')
        return thruster_outputs

    
## TESTING AS A SCRIPT
if __name__ == '__main__':
    navigator = Navigator()
    navigator.change_mode('MANUAL')
    navigator.arm()

    try:
        while True:
            navigator.send_rc(roll=1700)
            time.sleep(0.1)
    except KeyboardInterrupt:
        navigator.clear_motion()
        navigator.disarm()
