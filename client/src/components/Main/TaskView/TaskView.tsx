import './TaskView.css'
import { useState } from 'react'
import BlueCrabReference from '../../../assets/blue-crab-reference.png'
import { Box, Anchor, Gem, X, CheckCircle, Camera, Play } from 'lucide-react'
import { vehicleController } from '../../../controllers/vehicleController'
import { type CrabDetectionResponse } from '../../../services/Task/TaskService'
import { VideoFeed } from '../VideoFeed/VideoFeed'
import EdnaFrequency from '../EdnaFrequency/EdnaFrequency'
import IcebergThreat from '../IcebergThreat/IcebergThreat'

type TaskViewProps = {
    selectedTask: string | null
    closeTaskView: () => void
}

export default function TaskView({
    selectedTask,
    closeTaskView
}: TaskViewProps) {
    const [crabResult, setCrabResult] = useState<CrabDetectionResponse | null>(null)
    const [crabLoading, setCrabLoading] = useState(false)
    const [crabError, setCrabError] = useState<string | null>(null)

    const captureCrabDetection = async () => {
        setCrabLoading(true)
        setCrabError(null)
        try {
            const result = await vehicleController.getCrabDetection()
            setCrabResult(result)
        } catch (e) {
            setCrabError('Detection failed. Check the ROV connection.')
        } finally {
            setCrabLoading(false)
        }
    }

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
                                Analyze an image of the environment, such as a coral or underwater
                                structure, and build a 3D model-style visual representation.
                            </p>
                        </div>

                        <div className='task-view-section'>
                            <span className='task-section-label'>Process</span>

                            <div className='task-steps-list'>
                                <div className='task-step'>
                                    <span>1</span>
                                    <p>Capture or review the reference image.</p>
                                </div>

                                <div className='task-step'>
                                    <span>2</span>
                                    <p>Identify the object's shapes, edges and volume.</p>
                                </div>

                                <div className='task-step'>
                                    <span>3</span>
                                    <p>Generate the approximate visual model.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className='model-preview-panel'>
                        <div className='model-grid'>
                            {/* decorative nodes sit on top of the feed */}
                            <div className='model-object'>
                                <div className='model-node node-one'></div>
                                <div className='model-node node-two'></div>
                                <div className='model-node node-three'></div>
                                <div className='model-node node-four'></div>
                                <div className='model-core'></div>
                            </div>
                            <VideoFeed />  {/* fills the grid as background */}
                        </div>

                        <div className='model-status'>
                            <span>Generating model</span>
                            <strong>68%</strong>
                        </div>
                    </div>
                    <div className='task-view-actions'>
                        <button className='task-action-btn' onClick={() => vehicleController.setRoutine('start')}>
                            <Play size={15} />
                            start
                        </button>

                        <button className='task-action-btn' onClick={() => vehicleController.setRoutine('pause')}>
                            <Camera size={15} />
                            pause
                        </button>

                        
                        <button className='task-action-btn' onClick={() => vehicleController.setRoutine('resume')}>
                            <Camera size={15} />
                            resume
                        </button>

                        <button className='task-action-btn complete' onClick={() => vehicleController.setRoutine('stop')}>
                            <CheckCircle size={15} />
                            complete
                        </button>
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
                                Analyze the image provided by the ROV to identify the requested
                                crab and record the detection results.
                            </p>
                        </div>

                        <div className='crab-target-box'>
                            <span>Target reference</span>

                            <div className='crab-reference-image-box'>
                                <img
                                    className='crab-reference-image'
                                    src={BlueCrabReference}
                                    alt='European Green Crab reference'
                                />
                            </div>

                            <strong>European Green Crab</strong>
                        </div>

                        {(crabResult || crabError) && (
                            <div className='crab-results-panel'>
                                {crabError && <div className='result-notes'>{crabError}</div>}
                                {crabResult && (
                                    <>
                                        <div className='result-row'>
                                            <span>Crabs detected</span>
                                            <strong>{crabResult.results.length}</strong>
                                        </div>
                                        <div className='result-row'>
                                            <span>Invasive</span>
                                            <strong>
                                                {crabResult.results.filter(r => r.is_invasive).length}
                                            </strong>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className='crab-image-panel'>
                        <div className='crab-image-placeholder'>
                            {crabResult ? (
                                <img
                                    src={`data:image/jpeg;base64,${crabResult.image}`}
                                    alt='Crab detection result'
                                />
                            ) : (
                                <>
                                    <div className='scan-line'></div>
                                    <div className='video-container'>
                                        <VideoFeed />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <div className='task-view-actions'>
                        <button className='task-action-btn' onClick={captureCrabDetection} disabled={crabLoading}>
                            <Play size={15} />
                            {crabLoading ? 'analyzing' : 'detect'}
                        </button>

                        <button className='task-action-btn' onClick={() => setCrabResult(null)}>
                            <Camera size={15} />
                            live feed
                        </button>

                        <button className='task-action-btn complete' onClick={captureCrabDetection} disabled={crabLoading}>
                            <CheckCircle size={15} />
                            complete
                        </button>
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
                                Detect and monitor the position of icebergs using a radar-style view
                                to support the ROV's navigation.
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
                    <div className='task-view-actions'>
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
            )
        }

        return null
    }
    
    if (selectedTask == 'iceberg-threat') {
        return <IcebergThreat />
    }

    if (selectedTask == 'edna-frequency') {
        return <EdnaFrequency />
    }

    return (
        <div className='task-view-overlay'>
            <div className='task-view-screen'>
    
                {renderTaskContent()}
    
                <button
                    className='task-view-close'
                    onClick={closeTaskView}
                >
                    <X size={16} />
                </button>
    
            </div>
        </div>
    )
}