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
import numpy as np

from .capture import Capture
from flask import Flask, Response

from tasks.crab_detector import CrabDetector

navigator = Navigator()
tool = Tool(navigator.navigator_board)
clients = set()
logger = logging.getLogger(__name__)

last_motion = {
    "method": None, 
    "data": None
}

# Shared frame state
latest_frame = None   # annotated, for display
raw_frame = None      # clean, for detection
frame_lock = threading.Lock()

detector = CrabDetector()

# Routine state — initialized in main() to avoid event loop issues
routine_task = None
routine_paused = None
routine_active = False

# Crab detector state
crab_detector_active = False
latest_annotation = None
annotation_lock = threading.Lock()

IMG_FOR_PHASE1 = 3
IMG_FOR_PHASE2 = IMG_FOR_PHASE1 + 3
IMG_FOR_PHASE3 = IMG_FOR_PHASE2 + 3
INTERVAL = 2.0
ALPHA = 60
BETA  = 150

# ==== IMAGE PROCESSING ====

def brightness_adjustment(img):
    global ALPHA, BETA
    return cv2.convertScaleAbs(img, alpha=ALPHA, beta=BETA)

def ignore_blue(image):
    hsv        = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    lower_blue = np.array([40,  50, 125])
    upper_blue = np.array([130, 255, 255])
    mask       = cv2.inRange(hsv, lower_blue, upper_blue)
    return cv2.bitwise_and(image, image, mask=cv2.bitwise_not(mask))

def find_center(img, frame_center):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 50, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return img, None, None

    largest = max(contours, key=cv2.contourArea)
    M = cv2.moments(largest)
    if M["m00"] == 0:
        return img, None, None

    cX = int(M["m10"] / M["m00"])
    cY = int(M["m01"] / M["m00"])

    # Draw detected object center and crosshair on frame
    cv2.circle(img, (cX, cY), 8, (0, 255, 0), -1)
    cv2.line(img, (cX - 15, cY), (cX + 15, cY), (0, 255, 0), 2)
    cv2.line(img, (cX, cY - 15), (cX, cY + 15), (0, 255, 0), 2)

    # Draw frame center
    fx, fy = int(frame_center[0]), int(frame_center[1])
    cv2.circle(img, (fx, fy), 5, (0, 0, 255), -1)

    # Direction hints
    direction = []
    if   cX > frame_center[0] + 50: direction.append("right")
    elif cX < frame_center[0] - 50: direction.append("left")
    if   cY > frame_center[1] + 50: direction.append("down")
    elif cY < frame_center[1] - 50: direction.append("up")

    if direction:
        cv2.putText(img, " ".join(direction), (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

    return img, cX, cY

def process_frame(frame, frame_center):
    """Full pipeline: brightness → ignore blue → find center. Returns annotated frame."""
    frame = brightness_adjustment(frame)
    frame = ignore_blue(frame)
    frame, cX, cY = find_center(frame, frame_center)
    return frame, cX, cY

# ==== CAPTURE LOOP ====


def detection_loop():
    global latest_annotation
    while True:
        if crab_detector_active:
            with frame_lock:
                if raw_frame is None:
                    time.sleep(0.1)
                    continue
                frame_copy = raw_frame.copy()  # ← clean frame, not annotated

            detections = detector.detect(frame_copy)
            with annotation_lock:
                latest_annotation = detections
        else:
            time.sleep(0.1)


def capture_loop(capture):
    global latest_frame, raw_frame

    frame_center = (
        capture.cap.get(cv2.CAP_PROP_FRAME_WIDTH)  / 2,
        capture.cap.get(cv2.CAP_PROP_FRAME_HEIGHT) / 2,
    )

    while True:
        ret, frame = capture.get_frame()
        if ret:
            processed = frame
            if routine_active:
                processed, _, _ = process_frame(frame, frame_center)
            elif crab_detector_active:
                with annotation_lock:
                    annotation = latest_annotation
                if annotation:
                    processed = detector.draw(frame.copy(), annotation)

            with frame_lock:          
                raw_frame = frame.copy()
                latest_frame = processed


# ==== FLASK VIDEO ====
def generate_from_latest():
    while True:
        with frame_lock:
            frame = latest_frame
        if frame is not None:
            (flag, encoded) = cv2.imencode(".jpg", frame)
            if flag:
                yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' +
                       bytearray(encoded) + b'\r\n')

# ==== HANDLERS ====

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

# ==== AUTO ROUTINE ====
async def auto_routine():
    logger.info('Auto routine started')
    phase_step = 0  # Counts phase advances, not images
    phase_commands = [
        {"pitch": 0,  "roll": 200, "throttle": 0,  "yaw": 50},
        {"pitch": 10, "roll": 120, "throttle": 10, "yaw": 30},
        {"pitch": 20, "roll": 50,  "throttle": 20, "yaw": 10},
    ]

    try:
        last_advance = asyncio.get_event_loop().time()

        while phase_step < IMG_FOR_PHASE3:
            await routine_paused.wait()

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

    except asyncio.CancelledError:
        logger.info('Auto routine cancelled')
        navigator.clear_motion()
        last_motion['method'] = None

# ==== WEBSOCKET ====

async def echo(websocket):
    global routine_task, routine_paused, latest_annotation, routine_active, crab_detector_active

    clients.add(websocket)
    is_control_client = True
    try:
        async for message in websocket:
            try:
                commands = json.loads(message)
                logger.info(commands)
                drive_method = None
                arm_result = None
                routine_result = None
                crab_result = None

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
                if 'crab_detector' in commands:
                    if commands['crab_detector'] == 'capture':
                        crab_detector_active = True
                        crab_result = 'crab detection started'
                    elif commands['crab_detector'] == 'stop':
                        with annotation_lock:
                            latest_annotation = None
                        crab_detector_active = False
                        crab_result = 'crab detection stopped'
                    else:
                        crab_result = 'unknown crab_detector command'
                if 'routine' in commands:
                    action = commands['routine']
                    if action == 'start':
                        if routine_task is None or routine_task.done():
                            routine_paused.set()
                            routine_task = asyncio.create_task(auto_routine())
                            routine_active = True    
                            routine_result = 'started'
                        else:
                            routine_result = 'routine already running'
                    elif action == 'stop':
                        if routine_task and not routine_task.done():
                            routine_task.cancel()
                        routine_active = False       
                        routine_result = 'stopped'
                    elif action == 'pause':
                        routine_paused.clear()
                        routine_active = False       
                        routine_result = 'paused'
                    elif action == 'resume':
                        routine_paused.set()
                        routine_active = True        
                        routine_result = 'resumed'
                if 'alpha' in commands:
                    global ALPHA  
                    ALPHA = commands['alpha']
                    routine_result = f'alpha set to {ALPHA}'

                if 'beta' in commands:
                    global BETA   
                    BETA = commands['beta']
                    routine_result = f'beta set to {BETA}'
                    
                if routine_task and not routine_task.done():
                    r_status = 'running' if routine_paused.is_set() else 'paused'
                else:
                    r_status = 'idle'

                status = {
                    "message_received": True,
                    "arm_result": arm_result,
                    "routine_result": routine_result,
                    "routine_status": r_status,
                    "navigator_status": navigator.status(),
                    "crab_detector_result": crab_result,
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
            if routine_task and not routine_task.done():
                routine_task.cancel()
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

# ==== FLASK ====

flask_app = Flask(__name__)
capture = None

@flask_app.route('/video')
def video_feed():
    if latest_frame is None:
        return Response("Camera not ready", status=503)
    return Response(
        generate_from_latest(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )

def run_flask():
    logger.info('Starting Flask video server on port 5000')
    flask_app.run(host='0.0.0.0', port=5000, threaded=True)

# ==== ENTRY POINTS ====
def run():
    logger.info('Starting WebSocket server on port 55000')
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info('Server shutdown')
        navigator.clear_motion()
        navigator.disarm()

async def main():
    global capture, routine_paused

    routine_paused = asyncio.Event()
    routine_paused.set()

    capture = Capture(0)

    # Single capture consumer thread
    capture_thread = threading.Thread(target=capture_loop, args=(capture,), daemon=True)
    capture_thread.start()

    detection_thread = threading.Thread(target=detection_loop, daemon=True)  # ← add this
    detection_thread.start()

    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    asyncio.create_task(motion_loop())
    async with websockets.serve(echo, '0.0.0.0', 55000, process_request=lambda *args, **kwargs: None):
        logger.info('WebSocket server started on port 55000. Waiting for commands')
        await asyncio.Future()

# package example:
# {'drive_method': 'manual', 'mode': 'MANUAL', 'pitch': 500, 'roll': 0, 'throttle': 0, 'yaw': 0, 'buttons': 0}
# {"arm": 1, "drive_method": "manual", "mode": "MANUAL", "pitch": 500, "roll": 0, "throttle": 0, "yaw": 0, "buttons": 0}