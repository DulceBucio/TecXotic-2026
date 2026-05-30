    import './MainContainer.css'
    import TopNavBar from '../TopNavBar/TopNavBar'
    import BottomNavBar from '../BottomNavBar/BottomNavBar'
    import PlaceholderImg from '../../../assets/placeholder-img.png'
    import { useWebRTCStream } from '../../../hooks/useWebRTCStream'
    import { webRTCSignallingURI } from '../../Constants'
    import TasksPanel from '../TasksPanel/TasksPanel'
    import { useEffect, useState } from 'react'
    import { startGamepadPolling } from '../../../input/gamepad'
    import { useNavigate } from 'react-router-dom'
    export default function MainContainer() {
        const navigate = useNavigate()
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
        
        const [showTasks, setShowTasks] = useState<boolean>(false)

        useEffect(() => {
            startGamepadPolling()
        }, [])

        const toggleTasksPanel = () => {
        setShowTasks((prev) => !prev)
    }
        
        return (
            <>
                <div className='main-container'>
                    <div className='content-frame'>
                        <div className='top-container'>
                            {/* <button onClick={() => navigate('/model')}>View 3D Model</button>  ← add this */}
                            <TopNavBar/>
                        </div>
                        <div className='video-container'>
                            <div className='video-frame'>
                                <TasksPanel
                                showTasks={showTasks}
                                toggleTasksPanel={toggleTasksPanel}
                                />
                            <video ref={videoRef} autoPlay playsInline />
                            </div>
                        </div>
                        <div className='bottom-container'>
                            <BottomNavBar />
                        </div>
                    </div>
                </div>
            </>
        )
    }