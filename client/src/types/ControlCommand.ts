type DriveMethod = 'manual' | 'rc_channels' | null

export interface MotionCommand {
    pitch: number
    roll: number
    throttle: number
    yaw: number
    buttons?: number
}

export interface ControlState {
    armed: boolean
    connected: boolean
    mode: string
    drive_method: DriveMethod
    motion: MotionCommand
}

