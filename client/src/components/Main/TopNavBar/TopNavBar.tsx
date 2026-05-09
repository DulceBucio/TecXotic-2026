import TecxoticLogo from '../../../assets/tecxotic-logo.png'
import TecxoticName from '../../../assets/tecxotic-name.png'
import './TopNavBar.css'
import { Wifi, Gamepad2, Settings, Sliders } from "lucide-react"
import { controlStore } from '../../../state/controlStore'

const TopNavBar = () => {
    return (
        <>
            <div className='top-navbar-container'>
                <div className='logo-container'>
                    <img className='tecxotic-logo' src={TecxoticLogo} alt = 'logo'/>
                    <img className='tecxotic-name'src={TecxoticName} alt = 'name'/>
                </div>
                <div className='speed-slider-container'>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        defaultValue={1}
                        onChange={(e) => {
                            controlStore.setSpeed(Number(e.target.value))
                        }}
                        />
                </div>
                <div className='buttons-container'>
                    <button className='top-btn-small'>
                    <Wifi size={16} />
                </button>

                <button className='top-btn-small'>
                    <Gamepad2 size={16} />
                </button>

                <button className='top-btn'>
                    <Sliders size={16} />
                    controls
                </button>

                <button className='top-btn'>
                    <Settings size={16} />
                    settings
                </button>
                </div>
            </div>
        </>
    )
}

export default TopNavBar