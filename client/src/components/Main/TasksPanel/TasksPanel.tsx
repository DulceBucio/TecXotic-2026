import './TasksPanel.css'
import { Box, Anchor, Gem, SquarePercent } from 'lucide-react'

type TasksPanelProps = {
    showTasks: boolean
    selectedTask: string | null
    toggleTasksPanel: () => void
    selectTask: (taskId: string) => void
}

const tasks = [
    {
        id: '3d-model',
        title: '3D MODEL',
        icon: <Box size={34} />
    },
    {
        id: 'recovery-crab-gear',
        title: 'CRAB COUNT',
        icon: <Anchor size={34} />
    },
    {
        id: 'iceberg-tracking',
        title: 'ICEBERG',
        icon: <Gem size={34} />
    },
    {
        id: 'iceberg-threat',
        title: 'THREAT',
        icon: <Gem size={34} />
    },
    {
        id: 'edna-frequency',
        title: 'EDNA',
        icon: <SquarePercent size={34} />
    } 
]

export default function TasksPanel({
    showTasks,
    selectedTask,
    toggleTasksPanel,
    selectTask
}: TasksPanelProps) {
    return (
        <>
            <button
                className={`tasks-toggle-button ${showTasks ? 'active' : ''}`}
                onClick={toggleTasksPanel}
            >
                {showTasks ? '▶' : '◀'}
            </button>

            <div className={`tasks-panel ${showTasks ? 'open' : ''}`}>
                <div className='tasks-panel-header'>TASKS</div>

                <div className='tasks-list'>
                    {tasks.map((task) => (
                        <button
                            key={task.id}
                            className={`task-box ${selectedTask === task.id ? 'selected' : ''}`}
                            onClick={() => selectTask(task.id)}
                        >
                            <div className='task-box-icon'>
                                {task.icon}
                            </div>

                            <span>{task.title}</span>
                        </button>
                    ))}
                </div>
            </div>
        </>
    )
}