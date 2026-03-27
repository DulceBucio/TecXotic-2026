import './BottomNavBar.css'
import { useState } from 'react'
import { Camera, Video } from 'lucide-react'

const BottomNavBar = () => {
    const [camera, setCamera] = useState('cam1')
    return (
        <>
            <div className='bottom-navbar-container'>
                <div className='left-group-container'>
                    <button className='bottom-nav-button'>
                    <Camera className='button-icon' color="#00ccff"/>
                    <span>TAKE PHOTO</span>
                </button>

                <button className='bottom-nav-button'>
                    <Video className='button-icon record-icon' color="#00ccff"/>
                    <span>RECORD</span>
                </button>
                    <button className='bottom-nav-button'>pitch 5°</button>
                </div>
                <div className='gyro-container'>
                    <div className='gyro-card'>
                    <span className='gyro-title'>GYRO</span>
                    <span className='gyro-value'>160°</span>
                </div>
                </div>
                <div className='right-group-container'>
                     <button className='bottom-nav-button'>yaw 2°</button>
                <button
                    className={`bottom-nav-button ${
                        camera === 'cam1' ? 'bottom-nav-button--active' : ''
                    }`}
                    onClick={() => setCamera('cam1')}
                >
                    cam1
                </button>

                <button
                    className={`bottom-nav-button ${
                        camera === 'cam2' ? 'bottom-nav-button--active' : ''
                    }`}
                    onClick={() => setCamera('cam2')}
                >
                    cam2
                </button>

                <button
                    className={`bottom-nav-button ${
                        camera === 'both' ? 'bottom-nav-button--active' : ''
                    }`}
                    onClick={() => setCamera('both')}
                >
                    both
                </button>

                </div>
            </div>
        </>
    )
}

export default BottomNavBar