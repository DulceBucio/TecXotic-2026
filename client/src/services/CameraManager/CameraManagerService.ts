import { type CameraStream } from "../../types/CameraStream"
import { mapStream } from "../../utils/mapStream"
import { onboard_computer } from "../../components/Constants"

export class CameraManagerService {
    async getStreams(): Promise<CameraStream[]> {
        const res = await fetch(`${onboard_computer}:6020/streams`)

        if (!res.ok) {
            throw new Error(`Failed to fetch streams: ${res.status}`)
        }

        const data = await res.json()

        return data.map(mapStream)
    }
}