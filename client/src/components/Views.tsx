import { Routes, Route } from 'react-router-dom'
import Main from '../pages/Main/Main'

const Views = () => {
    return (
        <Routes>
            <Route path='/' element={<Main/>}></Route>
        </Routes>
    )
}

export default Views