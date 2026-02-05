export interface CameraStream {
    id: string
    running: boolean
    error?: string
    name: string
    encoding: 'H264' | 'MJPG' | 'YUYV' | string
    height: number
    width: number
    fps: number
    thermal: boolean
    source: string
}