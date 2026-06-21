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
import os
import base64
import numpy as np

from .capture import Capture
from flask import Flask, Response, request, jsonify
from flask_cors import CORS
from tasks.crab_detector import CrabDetector

# =============== All instances of the classes ===============
navigator = Navigator()
tool = Tool(navigator.navigator_board)
clients = set()
detector = CrabDetector()
logger = logging.getLogger(__name__)

# =============== Global variables ===============
# VIDEO CAPTURE
CAPTURE = Capture(0)

# FRAMES VARIABLES
LAST_FRAME = None
LAST_FRAME_LOCK = threading.Lock()

# DETECTION VARIABLES
LAST_DETECTION = None
LAST_DETECTION_LOCK = threading.Lock()

# ROUTINE CONTROL
last_motion = {
    "method": None,
    "data": None
}
INTERVAL = 3
IMG_FOR_PHASE1 = 15
IMG_FOR_PHASE2 = IMG_FOR_PHASE1 + 10
IMG_FOR_PHASE3 = IMG_FOR_PHASE2 + 5
ROUTINE_ACTIVE = False
ROUTINE_PAUSED = None
ROUTINE_FINISHED = False

# Reference to the asyncio event loop running in main(), so that
# Flask routes (running in their own thread) can safely schedule
# coroutines / mutate asyncio primitives on it.
MAIN_LOOP = None

# =============== All functions ===============
# ============== ECHO AND HANDLE FUNCTIONS =============

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
                arm_result = None

                if 'arm' in commands:
                    arm_result = handle_arm(commands['arm'])

                if 'mode' in commands:
                    handle_mode(commands['mode'])

                if 'drive_method' in commands:
                    last_motion['method'] = commands['drive_method']
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


# ============== VIDEO CAPTURE LOOP =============
def video_capture_loop():
    global LAST_FRAME
    while True:
        ret, frame = CAPTURE.get_frame()
        if ret and frame is not None:
            with LAST_FRAME_LOCK:
                LAST_FRAME = frame
        else:
            logger.warning("Failed to capture frame.")


def generate_from_latest():
    while True:
        with LAST_FRAME_LOCK:
            frame = LAST_FRAME
        if frame is not None:
            (flag, encoded) = cv2.imencode(".jpg", frame)
            if flag:
                yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' +
                       bytearray(encoded) + b'\r\n')


# ============== CRAB DETECTION AND DRAWING =============
def detect_on_frame(detector: CrabDetector):
    """Runs detection on a copy of the latest frame. Returns (frame_copy, detections) or (None, None)."""
    global LAST_DETECTION

    with LAST_FRAME_LOCK:
        frame_copy = LAST_FRAME.copy() if LAST_FRAME is not None else None

    if frame_copy is None:
        logger.error("No frame available for detection.")
        return None, None

    detections = detector.detect(frame_copy)
    with LAST_DETECTION_LOCK:
        LAST_DETECTION = detections

    return frame_copy, detections


def draw_on_frame(detector: CrabDetector, frame, detections):
    """Draws detections on the given frame. Returns the annotated frame, or None if there's nothing to draw."""
    if frame is None:
        logger.error("No frame available for drawing.")
        return None
    if not detections:
        logger.error("No detections available for drawing.")
        return frame
    return detector.draw(frame, detections)


# ============== Routine functions ==============
async def start_routine():
    logger.info('Auto routine started')
    global ROUTINE_ACTIVE, ROUTINE_FINISHED
    ROUTINE_ACTIVE = True
    ROUTINE_FINISHED = False
    phase_step = 0
    phase_commands = [
        {"pitch": 0,  "roll": 200, "throttle": 0,  "yaw": 50},
        {"pitch": 10, "roll": 120, "throttle": 10, "yaw": 30},
        {"pitch": 20, "roll": 50,  "throttle": 20, "yaw": 10},
    ]
    try:
        last_advance = asyncio.get_event_loop().time()

        while phase_step < IMG_FOR_PHASE3:
            await ROUTINE_PAUSED.wait()

            if phase_step < IMG_FOR_PHASE1:
                current_cmd = phase_commands[0]
            elif phase_step < IMG_FOR_PHASE2:
                current_cmd = phase_commands[1]
            else:
                current_cmd = phase_commands[2]

            last_motion['method'] = 'manual'
            last_motion['data'] = {"drive_method": "manual", **current_cmd, "buttons": 0}

            now = asyncio.get_event_loop().time()
            if now - last_advance >= INTERVAL:
                phase_step += 1
                last_advance = now
                logger.info(f'Routine: phase_step {phase_step}')

            await asyncio.sleep(0.05)

        logger.info('Auto routine completed')
        navigator.clear_motion()
        last_motion['method'] = None
        ROUTINE_ACTIVE = False
        ROUTINE_FINISHED = True
    except asyncio.CancelledError:
        logger.info('Auto routine cancelled')
        navigator.clear_motion()
        last_motion['method'] = None
        ROUTINE_ACTIVE = False


# Flask server and its routes
flask_app = Flask(__name__)
CORS(flask_app)


@flask_app.route('/video', methods=['GET'])
def video_feed():
    if LAST_FRAME is None:
        return Response("Camera not ready", status=503)
    return Response(
        generate_from_latest(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@flask_app.route('/crab-detection', methods=['GET'])
def get_crab_detection():
    frame, detections = detect_on_frame(detector)
    result = draw_on_frame(detector, frame, detections)

    if result is None:
        return jsonify({'error': 'No frame available'}), 500

    ok, buffer = cv2.imencode('.jpg', result)
    if not ok:
        return jsonify({'error': 'Failed to encode result image'}), 500

    jpg_as_text = base64.b64encode(buffer).decode('utf-8')
    return jsonify({
        'image': jpg_as_text,
        'results': [
            {
                'species':     d.species,
                'confidence':  d.confidence,
                'bbox':        list(d.bbox),
                'is_invasive': d.is_invasive,
            }
            for d in (detections or [])
        ],
    })


@flask_app.route('/routine', methods=['POST'])
def start_auto_routine():
    global ROUTINE_PAUSED, ROUTINE_ACTIVE, ROUTINE_FINISHED

    body = request.get_json()
    action = body.get('action') if body else None

    if action == 'start':
        if ROUTINE_ACTIVE:
            return jsonify({'status': 'Routine already active'}), 400
        ROUTINE_PAUSED = asyncio.Event()
        ROUTINE_PAUSED.set()
        # We're in a Flask request thread, not the asyncio event loop's
        # thread, so we have to hand the coroutine to the loop explicitly.
        asyncio.run_coroutine_threadsafe(start_routine(), MAIN_LOOP)
        return jsonify({'status': 'Routine started'})

    elif action == 'pause':
        if not ROUTINE_ACTIVE:
            return jsonify({'status': 'No active routine to pause'}), 400
        if not ROUTINE_PAUSED.is_set():
            return jsonify({'status': 'Routine already paused'}), 400
        MAIN_LOOP.call_soon_threadsafe(ROUTINE_PAUSED.clear)
        return jsonify({'status': 'Routine paused'})

    elif action == 'resume':
        if not ROUTINE_ACTIVE:
            return jsonify({'status': 'No active routine to resume'}), 400
        if ROUTINE_PAUSED.is_set():
            return jsonify({'status': 'Routine already running'}), 400
        MAIN_LOOP.call_soon_threadsafe(ROUTINE_PAUSED.set)
        return jsonify({'status': 'Routine resumed'})

    elif action == 'stop':
        if not ROUTINE_ACTIVE:
            return jsonify({'status': 'No active routine to stop'}), 400
        ROUTINE_ACTIVE = False
        ROUTINE_FINISHED = True
        navigator.clear_motion()
        last_motion['method'] = None
        return jsonify({'status': 'Routine stopped'})

    else:
        return jsonify({'error': 'Invalid action'}), 400


def run_flask():
    logger.info('Starting Flask video server on port 5000')
    flask_app.run(host='0.0.0.0', port=5000, threaded=True)


async def main():
    global MAIN_LOOP
    MAIN_LOOP = asyncio.get_running_loop()

    capture_thread = threading.Thread(target=video_capture_loop, daemon=True)
    capture_thread.start()
    
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    asyncio.create_task(motion_loop())
    async with websockets.serve(echo, '0.0.0.0', 55000, process_request=lambda *args, **kwargs: None):
        logger.info('WebSocket server started on port 55000. Waiting for commands')
        await asyncio.Future()


def run():
    logger.info('Starting WebSocket server on port 55000')
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info('Server shutdown')
        navigator.clear_motion()
        navigator.disarm()
        
# package example:
# {'drive_method': 'manual', 'mode': 'MANUAL', 'pitch': 500, 'roll': 0, 'throttle': 0, 'yaw': 0, 'buttons': 0}
# {"arm": 1, "drive_method": "manual", "mode": "MANUAL", "pitch": 500, "roll": 0, "throttle": 0, "yaw": 0, "buttons": 0}