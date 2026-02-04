import TecxoticLogo from '../../../assets/tecxotic-logo.png'
import TecxoticName from '../../../assets/tecxotic-name.png'
import './TopNavBar.css'

const TopNavBar = () => {
    return (
        <>
            <div className='top-navbar-container'>
                <div className='logo-container'>
                    <img className='tecxotic-logo' src={TecxoticLogo} />
                    <img className='tecxotic-name'src={TecxoticName} />
                </div>
                <div className='buttons-container'>
                    <button>button</button>
                    <button>button</button>
                    <button>button</button>
                    <button>button</button>
                </div>
            </div>
        </>
    )
}

export default TopNavBar