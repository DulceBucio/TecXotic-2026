import { CameraManagerService } from "../services/CameraManager/CameraManagerService"
import { useEffect, useState } from "react"
import { type CameraStream } from "../types/CameraStream"

const service = new CameraManagerService()

export function useCameraStreams() {
    const [streams, setStreams] = useState<CameraStream[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let mount = true
        
        async function load() {
            try {
                const result = await service.getStreams()
                if (mount) {
                    setStreams(result)
                    setError(null)
                }
            } catch (err) {
                if (mount) {
                    setError((err as Error).message)
                }
            } finally {
                if (mount) setLoading(false)
            }
        }

        load()

        return() => {
            mount = false
        }
    }, [])

    return { streams, loading, error }
}