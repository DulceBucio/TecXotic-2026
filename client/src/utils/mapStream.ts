import { type CameraStream } from "../types/CameraStream"

export function mapStream(raw: any): CameraStream {
    const stream_info = raw.video_and_stream.stream_information

    return {
        id: raw.id,
        running: raw.running,
        error: raw.error || undefined,
        name: raw.video_and_stream.name,
        encoding: stream_info.configuration.encode,
        height: stream_info.configuration.height,
        width: stream_info.configuration.width,
        fps: stream_info.configuration.frame_interval?.denominator && stream_info.configuration.frame_interval?.numerator
            ? stream_info.configuration.frame_interval.denominator / stream_info.configuration.frame_interval.numerator 
            : 0,
        thermal: stream_info.extended_configuration.thermal ?? 'false',
        source: raw.video_and_stream.video_source.Local.device_path ?? 'unknown'
    }
}