import threading

import websockets
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError
import asyncio
import json
from comms.navigator import Navigator
from comms.tool import Tool
import logging 
import time
import cv2

from .capture import Capture, generate
from flask import Flask, Response

navigator = Navigator()
tool = Tool(navigator.navigator_board)
clients = set()
logger = logging.getLogger(__name__)

last_motion = {
    "method": None, 
    "data": None
}

def handle_mode(mode):
    if mode != navigator.status()['mode']:
        navigator.change_mode(mode)

def handle_arm(arming):
    is_armed = navigator.status()['is_armed']

    if arming:
        logger.info('Arm requested')
        if is_armed:
            return {'armed': True, 'message': 'Vehicle already armed'}
        navigator.clear_motion()
        time.sleep(0.1)
        try:
            navigator.arm()
        except Exception as e:
            logger.error(f'Arming failed: {e}')
            return {'armed': False, 'error': 'arming failed'}
        return {'armed': True, 'message': 'motors armed'}
    else:
        logger.info('Disarm requested')
        if not is_armed:
            return {'armed': False, 'message': 'Vehicle already disarmed'}
        navigator.clear_motion()
        time.sleep(0.1)
        navigator.disarm()
        return {'armed': False, 'message': 'Motors disarmed'}

async def echo(websocket):
    clients.add(websocket)
    is_control_client = True 
    try:
        async for message in websocket:
            try:
                commands = json.loads(message)
                logger.info(commands)
                drive_method = None
                arm_result = None

                if 'arm' in commands:
                    arm_result = handle_arm(commands['arm'])

                if 'mode' in commands:
                    handle_mode(commands['mode'])

                if 'drive_method' in commands:
                    drive_method = commands['drive_method']
                    last_motion['method'] = drive_method
                    last_motion['data'] = commands

                if 'buttons' in commands:
                    logger.info('claw commands received')
                    claw_action = commands['buttons']
                    if claw_action == 0:
                        tool.control_gripper('stop')
                    elif claw_action == 1:
                        tool.control_gripper('open')
                    elif claw_action == 2:
                        tool.control_gripper('close')
                    elif claw_action == 3:
                        tool.control_gripper('left-roll')
                    elif claw_action == 4:
                        tool.control_gripper('right-roll')
                
                status = {
                    "message_received": True,
                    "arm_result": arm_result,
                    "navigator_status": navigator.status(),
                }

                await websocket.send(json.dumps(status))
            
            except json.JSONDecodeError as e:
                logger.error(f'Invalid JSON: {e}')
                await websocket.send(json.dumps({"error": "Invalid JSON"}))

            except KeyError as e:
                logger.error(f'Missing field: {e}')
                await websocket.send(json.dumps({"error": f"Missing field: {e}"}))

    except (ConnectionClosedOK, ConnectionClosedError) as e:
        logger.info(f'Client disconnected: {e}')
    
    except Exception as e:
        logger.info(f'Error in echo(): {e}')
    
    finally:
        clients.discard(websocket)
        if is_control_client and not clients:
            logger.info('Last control client left: disarming')
            navigator.clear_motion()
            navigator.disarm()

async def motion_loop():
    while True:
        if navigator.status()['is_armed'] and last_motion["method"]:
            d = last_motion["data"]

            if last_motion["method"] == "manual":
                navigator.drive_manual(
                    d.get("pitch", 0),
                    d.get("roll", 0),
                    d.get("throttle", 0),
                    d.get("yaw", 0),
                    d.get("buttons", 0),
                )
            elif last_motion["method"] == "rc_channels":
                navigator.send_rc(
                    d.get("pitch", 665535),
                    d.get("roll", 665535),
                    d.get("throttle", 665535),
                    d.get("yaw", 665535),
                )

        await asyncio.sleep(0.05)  

def run():
    logger.info('Starting WebSocket server on port 55000')
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info('Server shutdown')
        navigator.clear_motion()
        navigator.disarm()

# The whole flask initialization
flask_app = Flask(__name__)
capture = None 

@flask_app.route('/video')
def video_feed():
    if capture is None:
        return Response("Camera not ready", status=503)
    return Response(
        generate(capture),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )

def run_flask():
    logger.info('Starting Flask video server on port 5000')
    flask_app.run(host='0.0.0.0', port=5000, threaded=True)

async def main():
    global capture
    capture = Capture(0)

    # Flask runs in a separate thread to avoid blocking the asyncio event loop
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    asyncio.create_task(motion_loop())
    async with websockets.serve(echo, '0.0.0.0', 55000, process_request=lambda *args, **kwargs: None):
        logger.info('WebSocket server started on port 55000. Waiting for commands')
        await asyncio.Future() 

# package example:
# {'drive_method': 'manual', 'mode': 'MANUAL', 'pitch': 500, 'roll': 0, 'throttle': 0, 'yaw': 0, 'buttons': 0}
# {"arm": 1, "drive_method": "manual", "mode": "MANUAL", "pitch": 500, "roll": 0, "throttle": 0, "yaw": 0, "buttons": 0}