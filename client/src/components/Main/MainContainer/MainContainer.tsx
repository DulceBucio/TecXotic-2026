    import './MainContainer.css'
    import TopNavBar from '../TopNavBar/TopNavBar'
    import BottomNavBar from '../BottomNavBar/BottomNavBar'
    import PlaceholderImg from '../../../assets/placeholder-img.png'
    import { useWebRTCStream } from '../../../hooks/useWebRTCStream'
    import { webRTCSignallingURI } from '../../Constants'
    import { useEffect } from 'react'

    export default function MainContainer() {
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
                <div className='main-container'>
                    <div className='content-frame'>
                        <div className='top-container'>
                            <TopNavBar/>
                        </div>
                        <div className='video-container'>
                            <video ref={videoRef} autoPlay playsInline />
                        </div>
                        <div className='bottom-container'>
                            <BottomNavBar />
                        </div>
                    </div>
                </div>
            </>
        )
    }