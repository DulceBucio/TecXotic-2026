import websockets
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError
import asyncio
import json
from comms.navigator import Navigator
import logging 

navigator = Navigator()
clients = set()
logger = logging.getLogger(__name__)

def handle_mode(mode):
    if mode != navigator.status()['mode']:
        navigator.change_mode(mode)

def handle_arm(state):
    if state == 1:
        try: 
            if not navigator.status()['is_armed']:
                navigator.clear_motion()
                navigator.arm()
        except Exception as e:
            logger.error(f'Error in handling motors arming: {e}')
    else:
        try: 
            if navigator.status()['is_armed']:
                navigator.disarm()
        except Exception as e:
            logger.error(f'Error in handling motors disarming: {e}')

async def echo(websocket):
    clients.add(websocket)
    try:
        async for message in websocket:
            try:

                commands = json.loads(message)

                if 'mode' not in commands or 'drive_method' not in commands:
                    await websocket.send(json.dumps({
                        "error": "Missing required fields: mode, drive_method"
                    }))
                    continue
                
                handle_arm(commands['arm'])
                handle_mode(commands['mode'])
                drive_method = commands['drive_method']

                if drive_method == 'manual':
                    navigator.drive_manual(
                        commands.get('pitch', 0),
                        commands.get('roll', 0),
                        commands.get('throttle', 0),
                        commands.get('yaw', 0),
                        commands.get('buttons', 0)
                    )
                elif drive_method == 'rc_channels':
                    navigator.send_rc(
                        pitch=commands.get('pitch', 65535),
                        roll=commands.get('roll', 65535),
                        throttle=commands.get('throttle', 65535),
                        yaw=commands.get('yaw', 65535),
                        forward=commands.get('forward', 65535),
                        lateral=commands.get('lateral', 65535)
                    )
                
                status = {
                    "message_received": True,
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

def run():
    logger.info('Starting WebSocket server on port 55000')
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info('Server shutdown')
        navigator.clear_motion()
        navigator.disarm()

async def main():
    async with websockets.serve(echo, '0.0.0.0', 55000):
        logger.info('WebSocket server started on port 55000. Waiting for commands')
        await asyncio.Future() 

# package example:
# {'drive_method': 'manual', 'mode': 'MANUAL', 'pitch': 500, 'roll': 0, 'throttle': 0, 'yaw': 0, 'buttons': 0}
# {"arm": 1, "drive_method": "manual", "mode": "MANUAL", "pitch": 500, "roll": 0, "throttle": 0, "yaw": 0, "buttons": 0}