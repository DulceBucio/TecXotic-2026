import './BottomNavBar.css'

const BottomNavBar = () => {
    return (
        <>
            <div className='bottom-navbar-container'>
                <div className='left-group-container'>
                    <button>button</button>
                    <button>button</button>
                    <button>button</button>
                </div>
                <div className='gyro-container'>
                    <h1>gyro</h1>
                </div>
                <div className='right-group-container'>
                    <button>yaw</button>
                    <button>camera 1</button>
                    <button>camera 2</button>
                </div>
            </div>
        </>
    )
}

export default BottomNavBar