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

# MOTION CONTROL (manual driving, from websocket commands)
last_motion = {
    "method": None,
    "data": None
}

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


# Flask server and its routes
flask_app = Flask(__name__)


@flask_app.route('/video', methods=['GET'])
def video_feed():
    if LAST_FRAME is None:
        return Response("Camera not ready", status=503)
    return Response(
        generate_from_latest(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@flask_app.route('/capture', methods=['GET'])
def get_capture():
    """
    Returns the latest raw frame as base64 JPEG, with no detection involved.
    """
    with LAST_FRAME_LOCK:
        frame = LAST_FRAME.copy() if LAST_FRAME is not None else None

    if frame is None:
        return jsonify({'error': 'No frame available'}), 500

    ok, buffer = cv2.imencode('.jpg', frame)
    if not ok:
        return jsonify({'error': 'Failed to encode image'}), 500

    jpg_as_text = base64.b64encode(buffer).decode('utf-8')
    return jsonify({'image': jpg_as_text})


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


def run_flask():
    logger.info('Starting Flask video server on port 5000')
    flask_app.run(host='0.0.0.0', port=5000, threaded=True)


async def main():
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