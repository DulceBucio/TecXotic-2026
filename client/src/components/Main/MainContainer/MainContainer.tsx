    import './MainContainer.css'
    import TopNavBar from '../TopNavBar/TopNavBar'
    import BottomNavBar from '../BottomNavBar/BottomNavBar'
    import { useWebRTCStream } from '../../../hooks/useWebRTCStream'
    import { webRTCSignallingURI } from '../../Constants'
    import TasksPanel from '../TasksPanel/TasksPanel'
    import { useEffect, useState } from 'react'
    import { startGamepadPolling } from '../../../input/gamepad'
    import { useNavigate } from 'react-router-dom'
    import TaskView from '../TaskView/TaskView'
    import { VideoFeed } from '../VideoFeed/VideoFeed'

    export default function MainContainer() {
        const navigate = useNavigate()
        // const rtcConfiguration: RTCConfiguration = {
        //     iceServers: [
        //     { urls: "stun:stun.l.google.com:19302" },
        //     { urls: "stun:stun1.l.google.com:19302" }
        //     ],
        //     iceCandidatePoolSize: 2
        // }

        // const {
        //     videoRef,
        //     streams,
        //     start,
        //     stop,
        //     connected
        // } = useWebRTCStream(webRTCSignallingURI, rtcConfiguration)

        // useEffect(() => {
        //     if (streams.length > 0 && !connected) {
        //         start(streams[0])
        //     }
        // }, [streams, connected, start])
        
        const [showTasks, setShowTasks] = useState<boolean>(false)
        const [selectedTask, setSelectedTask] = useState<string | null>(null)

        useEffect(() => {
            startGamepadPolling()
        }, [])

        const toggleTasksPanel = () => {
        setShowTasks((prev) => !prev)
    }

        const selectTask = (taskId: string) => {
            setSelectedTask(taskId)
        }

        const closeTaskView = () => {
            setSelectedTask(null)
        }

        return (
            <>
                <div className='main-container'>
                    <div className='content-frame'>
                        <div className='top-container'>
                            <TopNavBar />
                        </div>

                        <div className='video-container'>
                            <div className='video-frame'>
                                <TaskView
                                    selectedTask={selectedTask}
                                    closeTaskView={closeTaskView}
                                />

                                <TasksPanel
                                showTasks={showTasks}
                                selectedTask={selectedTask}
                                toggleTasksPanel={toggleTasksPanel}
                                selectTask={selectTask}
                            />
                            <VideoFeed />
                            {/* <video ref={videoRef} autoPlay playsInline /> */}
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