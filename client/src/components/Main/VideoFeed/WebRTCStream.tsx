import { useWebRTCStream } from "../../../hooks/useWebRTCStream"
import { webRTCSignallingURI } from "../../Constants"
import { useEffect } from "react"

export default function WebRTCStream() {
    const rtcConfiguration: RTCConfiguration = {
        iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
        ],
        iceCandidatePoolSize: 2
    }

    const {
        videoRef,
        streams,
        start,
        stop,
        connected
    } = useWebRTCStream(webRTCSignallingURI, rtcConfiguration)

    useEffect(() => {
        if (streams.length > 0 && !connected) {
            start(streams[0])
        }
    }, [streams, connected, start])
    
    return (
        <>
            <video className='webrtc-stream' ref={videoRef} autoPlay playsInline />
        </>
    )
}
