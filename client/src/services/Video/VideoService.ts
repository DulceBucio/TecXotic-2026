// services/Video/VideoService.ts
import { onboard_computer } from "../../components/Constants"

export class VideoService {
    getVideoUrl() {
        return `http://${onboard_computer}:5000/video`
    }
}