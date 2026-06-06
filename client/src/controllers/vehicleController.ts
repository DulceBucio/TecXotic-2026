import { onboard_computer } from "../components/Constants";
import { type MotionCommand } from "../types/ControlCommand";
import { CommandService } from "../services/Commands/CommandService";
import { controlStore } from "../state/controlStore";

class VehicleController {
    public commandService = new CommandService()
    private CONTROL_RATE = 50 // ms = 20Hz

    constructor() {
        this.connect()
        this.startControlLoop()
    }

    private connect() {
        this.commandService.connect(`ws://${onboard_computer}:55000`)
        controlStore.setConnected(true)
    }

    arm() {
        this.commandService.send({ arm: true })
        controlStore.setArmed(true)
    }

    disarm() {
        this.commandService.send({arm: false })
        controlStore.setArmed(false)
    }

    setMode(mode: 'MANUAL' | 'STABILIZE') {
        this.commandService.send({ mode })
        controlStore.setMode(mode)
    }

    driveDefault(input: MotionCommand) {
        controlStore.updateCommand(input)
    }

    setRoutine(action: 'start' | 'pause' | 'resume' | 'stop') {
        this.commandService.send({ routine: action })
    }

    setCrabDetection(action: 'capture' | 'stop') {
        this.commandService.send({ crab_detection: action })
    }

    stop() {
        controlStore.resetMotion()
        const state = controlStore.getState()
        const command = {
            drive_method: state.drive_method,
            mode: state.drive_method,
            ... state.motion
        }

        this.commandService.send(command)
    }

    private startControlLoop() {
        setInterval(() => {
            const state = controlStore.getState()
            if (!state.connected) return
            if (!state.armed) return

            const m = state.speedMultiplier
            
            const command = {
                drive_method: state.drive_method,
                mode: state.mode,

                pitch: Math.round(state.motion.pitch * m),
                roll: Math.round(state.motion.roll * m),
                yaw: Math.round(state.motion.yaw * m),
                throttle: Math.round(state.motion.throttle * m),

                buttons: state.motion.buttons
            }
            this.commandService.send(command)
        }, this.CONTROL_RATE)
    }
}

export const vehicleController = new VehicleController()