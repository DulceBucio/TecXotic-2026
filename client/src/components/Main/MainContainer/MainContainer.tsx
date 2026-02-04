import './MainContainer.css'
import TopNavBar from '../TopNavBar/TopNavBar'

export default function MainContainer() {
    return (
        <>
            <div className='main-container'>
                <div className='content-frame'>
                    <div className='top-container'>
                        <TopNavBar/>
                    </div>
                </div>
            </div>
        </>
    )
}