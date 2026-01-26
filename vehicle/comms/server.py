import websockets
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError
import asyncio
import json
from comms.navigator import Navigator
import logging 
import time

navigator = Navigator()
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

                if navigator.status()['is_armed'] and 'drive_method' in commands:
                    drive_method = commands['drive_method']
                    last_motion['method'] = drive_method
                    last_motion['data'] = commands
                
                status = {
                    "message_received": True,
                    "arm_result": arm_result,
                    "navigator_status": navigator.status(),
                    "thrusters_value": navigator.get_thruster_outputs()
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
        clients.remove(websocket)
        logger.info('Client disconnected')
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

async def main():
    asyncio.create_task(motion_loop())
    async with websockets.serve(echo, '0.0.0.0', 55000):
        logger.info('WebSocket server started on port 55000. Waiting for commands')
        await asyncio.Future() 

# package example:
# {'drive_method': 'manual', 'mode': 'MANUAL', 'pitch': 500, 'roll': 0, 'throttle': 0, 'yaw': 0, 'buttons': 0}
# {"arm": 1, "drive_method": "manual", "mode": "MANUAL", "pitch": 500, "roll": 0, "throttle": 0, "yaw": 0, "buttons": 0}