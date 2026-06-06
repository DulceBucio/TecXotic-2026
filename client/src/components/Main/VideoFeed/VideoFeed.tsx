import { videoController } from "../../../controllers/videoController"

export function VideoFeed() {
    return (
        <div className="video-feed">
            <img
                src={videoController.getStreamUrl()}
                alt="ROV Camera"
                className="video-stream"
            />
        </div>
    )
}