import { Routes, Route } from 'react-router-dom'
import Main from '../pages/Main/Main'
import Model from '../pages/Model/Model'

const Views = () => {
    return (
        <Routes>
            <Route path='/model' element={<Model/>}></Route>
            <Route path='/' element={<Main/>}></Route>
            
        </Routes>
    )
}

export default Views