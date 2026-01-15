from pymavlink import mavutil
import os
import sys

MAVLINK_URL = os.getenv('MAVLINK_URL', 'udpin:0.0.0.0:14550')

class Navigator:
    def __init__(self):
        try:
            self.navigator_board = mavutil.mavlink_connection(MAVLINK_URL)
            self.navigator_board.wait_heartbeat()
        except Exception as e:
            print('Error in connecting to Navigator')
            sys.exit(1)
        self.disarm()
        self.change_mode('MANUAL')

    def arm(self):
        print('Arming motors...')
        self.navigator_board.arducopter_arm()
        self.navigator_board.motors_armed_wait()
        print('MOTORS ARMED')

    def disarm(self):
        print('Disarming motors...')
        self.navigator_board.arducopter_disarm()
        self.navigator_board.motors_disarmed_wait()
        print('MOTORS DISARMED')

    def change_mode(self, mode):
        if mode not in self.navigator_board.mode_mapping():
            print('Unknown mode')
            sys.exit(1)

        mode_id = self.navigator_board.mode_mapping()[mode]
        self.navigator_board.set_mode(mode_id)

    def drive(self, pitch, roll, throttle, yaw, forward, lateral):
        self.navigator_board.rc_channels_override_send(
            self.navigator_board.target_system, 
            self.navigator_board.target_component,
            pitch, roll, throttle, yaw, forward, lateral
        )

        ## esto está mal xd

    