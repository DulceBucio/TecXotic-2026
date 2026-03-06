import { useEffect, useRef, useState } from "react";
import { WebRTCManager } from "../services/WebRTC/WebRTCManager";
import { type CameraStream } from "../types/CameraStream";

export function useWebRTCStream(uri: URL, rtcConfig: RTCConfiguration) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const managerRef = useRef<WebRTCManager | null>(null)

    const [streamStatus, setStreamStatus] = useState("")
    const [signallerStatus, setSignallerStatus] = useState("")
    const [connected, setConnected] = useState(false)
    const [streams, setStreams] = useState<CameraStream[]>([])

    useEffect(() => {
        const manager = new WebRTCManager(uri, rtcConfig, {
            onMediaStream: (stream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream ?? null
                }
            },

            onStreamStatus: (status) => {
                setStreamStatus(status)
            },

            onSignallerStatus: (status) => {
                setSignallerStatus(status)
            },

            onConnected: (value) => {
                setConnected(value)
            },

            onAvailableStreams: (streams) => {
                setStreams(streams)
            }
        })

        managerRef.current = manager

        return () => {
            manager.close('React unmount')
        }
    }, [uri, rtcConfig])

    const start = (stream: CameraStream) => {
        managerRef.current?.startStream(stream, [], [], 0)
    }

    const stop = () => {
        managerRef.current?.close('User stopped stream')
    }

    return {
        videoRef, 
        start,
        stop,
        streams,
        streamStatus, 
        signallerStatus,
        connected
    }
}