import type { MotionCommand, ControlState } from "../types/ControlCommand";

class ControlStore {
    private state: ControlState = {
        armed: false,
        connected: false,
        mode: 'MANUAL',
        drive_method: 'manual',
        speed: 1,
        motion: {
            pitch: 0,
            roll: 0,
            throttle: 0,
            yaw: 0,
            buttons: 0
        }
    }

    getState() {
        return this.state
    }

    setConnected(status: boolean) {
        this.state.connected = status
    }

    setArmed(value: boolean) {
        this.state.armed = value
    }

    setMode(mode: string) {
        this.state.mode = mode
    }

    setSpeed(value: number) {
        this.state.speed = value
    }

    getSpeed() {
        return this.state.speed
    }

    updateCommand(motion: Partial<MotionCommand>) {
        this.state.motion = {
            ...this.state.motion,
            ...motion
        }
    }

    resetMotion() {
        this.state.motion = {
            pitch: 0,
            roll: 0,
            yaw: 0,
            throttle: 0,
            buttons: 0
        }
    }

    getMotion(): MotionCommand {
        return this.state.motion
    }
}

export const controlStore = new ControlStore()