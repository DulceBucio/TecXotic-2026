import './TaskView.css'
import BlueCrabReference from '../../../assets/blue-crab-reference.png'
import { Box, Anchor, Gem, X, CheckCircle, Camera, Play } from 'lucide-react'
import { vehicleController } from '../../../controllers/vehicleController'

type TaskViewProps = {
    selectedTask: string | null
    closeTaskView: () => void
}

export default function TaskView({
    selectedTask,
    closeTaskView
}: TaskViewProps) {
    if (!selectedTask) return null

    const renderTaskContent = () => {
        if (selectedTask === '3d-model') {
            return (
                <div className='task-layout model-layout'>
                    <div className='task-info-panel'>
                        <div className='task-view-header'>
                            <div className='task-view-icon'>
                                <Box size={42} />
                            </div>

                            <div>
                                <h2>3D MODEL</h2>
                                <p>In progress</p>
                            </div>
                        </div>

                        <div className='task-view-section'>
                            <span className='task-section-label'>Objective</span>
                            <p>
                                Analizar una imagen del entorno, como un coral o estructura submarina,
                                y construir una representación visual tipo modelo 3D.
                            </p>
                        </div>

                        <div className='task-view-section'>
                            <span className='task-section-label'>Process</span>

                            <div className='task-steps-list'>
                                <div className='task-step'>
                                    <span>1</span>
                                    <p>Capturar o revisar la imagen de referencia.</p>
                                </div>

                                <div className='task-step'>
                                    <span>2</span>
                                    <p>Identificar formas, bordes y volumen del objeto.</p>
                                </div>

                                <div className='task-step'>
                                    <span>3</span>
                                    <p>Generar el modelo visual aproximado.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className='model-preview-panel'>
                        <div className='model-grid'>
                            <div className='model-object'>
                                <div className='model-node node-one'></div>
                                <div className='model-node node-two'></div>
                                <div className='model-node node-three'></div>
                                <div className='model-node node-four'></div>
                                <div className='model-core'></div>
                            </div>
                        </div>

                        <div className='model-status'>
                            <span>Generating model</span>
                            <strong>68%</strong>
                        </div>
                    </div>
                </div>
            )
        }

        if (selectedTask === 'recovery-crab-gear') {
            return (
                <div className='task-layout crab-layout'>
                    <div className='task-info-panel'>
                        <div className='task-view-header'>
                            <div className='task-view-icon'>
                                <Anchor size={42} />
                            </div>

                            <div>
                                <h2>CRAB COUNT</h2>
                                <p>Image analysis</p>
                            </div>
                        </div>

                        <div className='task-view-section'>
                            <span className='task-section-label'>Objective</span>
                            <p>
                                Analizar la imagen indicada por el ROV para identificar el cangrejo
                                solicitado y registrar los resultados de detección.
                            </p>
                        </div>

                        <div className='crab-target-box'>
                            <span>Target reference</span>

                            <div className='crab-reference-image-box'>
                                <img
                                    className='crab-reference-image'
                                    src={BlueCrabReference}
                                    alt='Blue Crab reference'
                                />
                            </div>

                            <strong>Blue Crab</strong>
                        </div>
                    </div>

                    <div className='crab-image-panel'>
                        <div className='crab-image-placeholder'>
                            <div className='scan-line'></div>
                            <span>Crab image feed</span>
                        </div>
                    </div>

                    <div className='crab-results-panel'>
                        <span className='task-section-label'>Results</span>

                        <div className='result-row'>
                            <span>Detected</span>
                            <strong>Blue Crab</strong>
                        </div>

                        <div className='result-row'>
                            <span>Confidence</span>
                            <strong>91%</strong>
                        </div>

                        <div className='result-row'>
                            <span>Status</span>
                            <strong>Match</strong>
                        </div>

                        <div className='result-notes'>
                            Shape and color pattern match the requested target.
                        </div>
                    </div>
                </div>
            )
        }

        if (selectedTask === 'iceberg-tracking') {
            return (
                <div className='task-layout iceberg-layout'>
                    <div className='task-info-panel'>
                        <div className='task-view-header'>
                            <div className='task-view-icon'>
                                <Gem size={42} />
                            </div>

                            <div>
                                <h2>ICEBERG TRACKING</h2>
                                <p>Radar detection</p>
                            </div>
                        </div>

                        <div className='task-view-section'>
                            <span className='task-section-label'>Objective</span>
                            <p>
                                Detectar y monitorear la posición de icebergs utilizando una vista tipo radar
                                para apoyar la navegación del ROV.
                            </p>
                        </div>
                    </div>

                    <div className='radar-panel'>
                        <div className='radar-circle'>
                            <div className='radar-sweep'></div>
                            <div className='radar-ring ring-one'></div>
                            <div className='radar-ring ring-two'></div>
                            <div className='radar-line horizontal'></div>
                            <div className='radar-line vertical'></div>

                            <div className='iceberg-dot dot-one'></div>
                            <div className='iceberg-dot dot-two'></div>
                            <div className='iceberg-dot dot-three'></div>
                        </div>

                        <div className='radar-data'>
                            <div>
                                <span>Icebergs detected</span>
                                <strong>3</strong>
                            </div>

                            <div>
                                <span>Closest distance</span>
                                <strong>4.2 m</strong>
                            </div>

                            <div>
                                <span>Tracking status</span>
                                <strong>Active</strong>
                            </div>
                        </div>
                    </div>
                </div>
            )
        }

        return null
    }

    return (
        <div className='task-view-overlay'>
            <div className='task-view-screen'>
                <button
                    className='task-view-close'
                    onClick={closeTaskView}
                >
                    <X size={16} />
                </button>

                {renderTaskContent()}

                <div className='task-view-actions'>
                    {/* TODO: estilizar botones */}
                    <button onClick={() => vehicleController.setRoutine('start')}>Start Routine</button>
                    <button onClick={() => vehicleController.setRoutine('pause')}>Pause Routine</button>
                    <button onClick={() => vehicleController.setRoutine('resume')}>Resume Routine</button>
                    <button onClick={() => vehicleController.setRoutine('stop')}>Stop Routine</button>

                    <button className='task-action-btn'>
                        <Play size={15} />
                        start
                    </button>

                    <button className='task-action-btn'>
                        <Camera size={15} />
                        evidence
                    </button>

                    <button className='task-action-btn complete'>
                        <CheckCircle size={15} />
                        complete
                    </button>
                </div>
            </div>
        </div>
    )
}