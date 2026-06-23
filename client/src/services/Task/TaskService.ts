// services/Task/TaskService.ts
import { onboard_computer } from "../../components/Constants"

export type CrabDetection = {
    species: string
    confidence: number
    bbox: number[]
    is_invasive: boolean
}

export type CrabDetectionResponse = {
    image: string // base64-encoded annotated JPEG
    results: CrabDetection[]
}

export type CaptureResponse = {
    image: string    // base64-encoded raw JPEG
    filename: string // name of the .jpeg saved on the backend, e.g. capture_20260620_153000.jpeg
    path: string      // full path on the backend's disk, e.g. .../captures/capture_20260620_153000.jpeg
}

export type MeasurementResponse = {
    measurement_px: number // largest X-axis span of the main contour, in pixels
}

export type RoutineAction = 'start' | 'pause' | 'resume' | 'stop'

export class TaskService {
    private baseUrl = `http://${onboard_computer}:5000`

    async getCrabDetection(): Promise<CrabDetectionResponse> {
        const res = await fetch(`${this.baseUrl}/crab-detection`)
        if (!res.ok) throw new Error(`Crab detection failed: ${res.status}`)
        return res.json()
    }

    async getCapture(): Promise<CaptureResponse> {
        const res = await fetch(`${this.baseUrl}/capture`)
        if (!res.ok) throw new Error(`Capture failed: ${res.status}`)
        return res.json()
    }

    async getMeasurement(): Promise<MeasurementResponse> {
        const res = await fetch(`${this.baseUrl}/measurement`)
        if (!res.ok) throw new Error(`Measurement failed: ${res.status}`)
        return res.json()
    }

    async setRoutine(action: RoutineAction): Promise<{ status?: string; error?: string }> {
        const res = await fetch(`${this.baseUrl}/routine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        })
        return res.json()
    }
}