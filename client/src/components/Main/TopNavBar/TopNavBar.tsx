import { useEffect, useState } from 'react'
import TecxoticLogo from '../../../assets/tecxotic-logo.png'
import TecxoticName from '../../../assets/tecxotic-name.png'
import './TopNavBar.css'
import { Wifi, Gamepad2, Settings, Sliders } from 'lucide-react'
import { controlStore } from '../../../state/controlStore'

const TopNavBar = () => {
    const [speed, setSpeed] = useState<number>(100)
    const [settingsOpen, setSettingsOpen] = useState<boolean>(false)
    const [isRovConnected, setIsRovConnected] = useState<boolean>(false)
    const [isControllerConnected, setIsControllerConnected] = useState<boolean>(false)

    useEffect(() => {
        const checkStatus = () => {
            setIsRovConnected(controlStore.getState().connected)

            const gamepads = navigator.getGamepads()
            const controllerConnected = Array.from(gamepads).some(
                (gamepad) => gamepad !== null
            )

            setIsControllerConnected(controllerConnected)
        }

        checkStatus()

        const interval = setInterval(checkStatus, 500)

        return () => clearInterval(interval)
    }, [])

    const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSpeed = Number(e.target.value)

        setSpeed(newSpeed)
        controlStore.setSpeed(newSpeed)
    }

    return (
        <div className='top-navbar-container'>
            <div className='logo-container'>
                <img
                    className='tecxotic-logo'
                    src={TecxoticLogo}
                    alt='logo'
                />

                <img
                    className='tecxotic-name'
                    src={TecxoticName}
                    alt='name'
                />
            </div>

            <div className='buttons-container'>
                <button
                    className={`top-btn-small ${isRovConnected ? '' : 'status-active'}`}
                    title={isRovConnected ? 'ROV connected' : 'ROV disconnected'}
                >
                    <Wifi size={16} />
                </button>

                <button
                    className={`top-btn-small ${isControllerConnected ? '' : 'status-active'}`}
                    title={isControllerConnected ? 'Controller connected' : 'Controller disconnected'}
                >
                    <Gamepad2 size={16} />
                </button>

                <button className='top-btn'>
                    <Sliders size={16} />
                    controls
                </button>

                <div className='settings-wrapper'>
                    <button
                        className={`top-btn ${settingsOpen ? 'settings-active' : ''}`}
                        onClick={() => setSettingsOpen(!settingsOpen)}
                    >
                        <Settings size={16} />
                        settings
                    </button>

                    {settingsOpen && (
                        <div className='settings-dropdown'>
                            <div className='settings-dropdown-header'>
                                <span>Speed Control</span>
                                <span className='speed-value'>
                                    {speed.toFixed(0)}
                                </span>
                            </div>

                            <input
                                className='settings-speed-slider'
                                type='range'
                                min={0}
                                max={100}
                                step={1}
                                value={speed}
                                onChange={handleSpeedChange}
                            />

                            <div className='speed-scale'>
                                <span>0</span>
                                <span>100</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default TopNavBar