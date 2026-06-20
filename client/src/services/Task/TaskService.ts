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

export type RoutineAction = 'start' | 'pause' | 'resume' | 'stop'

export class TaskService {
    private baseUrl = `http://${onboard_computer}:5000`

    async getCrabDetection(): Promise<CrabDetectionResponse> {
        const res = await fetch(`${this.baseUrl}/crab-detection`)
        if (!res.ok) throw new Error(`Crab detection failed: ${res.status}`)
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
