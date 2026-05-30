import './TasksPanel.css'
import { vehicleController } from '../../../controllers/vehicleController'

type TasksPanelProps = {
    showTasks: boolean
    toggleTasksPanel: () => void
}

export default function TasksPanel({
    showTasks,
    toggleTasksPanel
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

                <div className='task-box'></div>
                <div className='task-box'></div>
                <div className='task-box'>
                    <button onClick={() => vehicleController.setRoutine('start')}>Start Routine</button>
                    <button onClick={() => vehicleController.setRoutine('pause')}>Pause Routine</button>
                    <button onClick={() => vehicleController.setRoutine('resume')}>Resume Routine</button>
                    <button onClick={() => vehicleController.setRoutine('stop')}>Stop Routine</button>
                </div>
            </div>
        </>
    )
}