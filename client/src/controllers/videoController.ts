import { VideoService } from "../services/Video/VideoService"

class VideoController {
    private videoService = new VideoService()

    getStreamUrl() {
        return this.videoService.getVideoUrl()
    }
}

export const videoController = new VideoController()