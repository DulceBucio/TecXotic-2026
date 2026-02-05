import './MainContainer.css'
import TopNavBar from '../TopNavBar/TopNavBar'
import BottomNavBar from '../BottomNavBar/BottomNavBar'
import PlaceholderImg from '../../../assets/placeholder-img.png'

export default function MainContainer() {
    return (
        <>
            <div className='main-container'>
                <div className='content-frame'>
                    <div className='top-container'>
                        <TopNavBar/>
                    </div>
                    <div className='video-container'>
                        <img className  ='placeholder-img' src={PlaceholderImg} />
                    </div>
                    <div className='bottom-container'>
                        <BottomNavBar />
                    </div>
                </div>
            </div>
        </>
    )
}