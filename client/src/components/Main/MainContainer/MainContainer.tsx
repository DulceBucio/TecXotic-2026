    import './MainContainer.css'
    import TopNavBar from '../TopNavBar/TopNavBar'
    import BottomNavBar from '../BottomNavBar/BottomNavBar'
    import TasksPanel from '../TasksPanel/TasksPanel'
    import { useEffect, useState } from 'react'
    import { startGamepadPolling } from '../../../input/gamepad'
    import TaskView from '../TaskView/TaskView'
    import WebRTCStream from '../VideoFeed/WebRTCStream'

    export default function MainContainer() {
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
                        <WebRTCStream />
                        </div>
                    </div>

                </div>
            </div>
        </>
    )
}