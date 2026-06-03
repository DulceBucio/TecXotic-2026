import './ModelContainer.css'
import { Suspense } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { OrbitControls, Center } from '@react-three/drei'
import { Environment } from '@react-three/drei'



function Model({ url }: { url: string }) {
    const geometry = useLoader(PLYLoader, url)
    geometry.computeVertexNormals()
    return (
        <mesh geometry={geometry}>
            <meshStandardMaterial vertexColors />
        </mesh>
    )
}

export default function ModelContainer() {
    return (
        <div style={{ width: '100vh', height: '100vh' }}>
            <h1>Modelo</h1>
            <Canvas camera={{ position: [1, 1, 5], fov: 50 }}>
                <Environment preset="studio" />
                <ambientLight intensity={0.1} />
                <pointLight position={[10, 10, 10]} />

                <Suspense fallback={<p>Loading model...</p>}>
                    <Center>
                        <Model url="src\components\Model\ModelContainer\output.ply" />
                    </Center>
                </Suspense>

                <OrbitControls />
            </Canvas>
        </div>
    )
}