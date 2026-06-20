import { useState, useMemo } from 'react'
import './IcebergThreat.css'
import { Gem } from 'lucide-react'

type Platform = {
    id: number
    name: string
    lat: number
    lon: number
    oceanDepth: number // meters, positive value
    icebergLat: string
    icebergLon: string
    keelDepth: string
}

const INITIAL_PLATFORMS: Platform[] = [
    { id: 1, name: 'Hibernia', lat: 46.7504, lon: -48.7819, oceanDepth: 78, icebergLat: '', icebergLon: '', keelDepth: '' },
    { id: 2, name: 'Sea Rose', lat: 46.7895, lon: -48.1417, oceanDepth: 107, icebergLat: '', icebergLon: '', keelDepth: '' },
    { id: 3, name: 'Terra Nova', lat: 46.4, lon: -48.4, oceanDepth: 91, icebergLat: '', icebergLon: '', keelDepth: '' },
    { id: 4, name: 'Hebron', lat: 46.544, lon: -48.498, oceanDepth: 93, icebergLat: '', icebergLon: '', keelDepth: '' },
]

function toRad(deg: number) {
    return deg * Math.PI / 180
}

// Haversine distance in nautical miles
function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 3440.065 // Earth radius in nautical miles
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

type Threat = 'green' | 'yellow' | 'red' | 'pending'

function getThreat(dist: number | null, keelDepth: number | null, oceanDepth: number): Threat {
    if (dist === null || keelDepth === null || isNaN(dist) || isNaN(keelDepth)) return 'pending'
    if (keelDepth >= oceanDepth * 1.1) return 'green' // grounds before reaching platform
    if (dist > 10) return 'green'
    if (dist >= 5) return 'yellow'
    return 'red'
}

export default function IcebergThreat() {
    const [platforms, setPlatforms] = useState<Platform[]>(INITIAL_PLATFORMS)

    const update = (id: number, field: keyof Platform, value: string) => {
        setPlatforms(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
    }

    const computed = useMemo(() => {
        return platforms.map(p => {
            const iLat = parseFloat(p.icebergLat)
            const iLon = parseFloat(p.icebergLon)
            const keel = parseFloat(p.keelDepth)

            const hasPosition = !isNaN(iLat) && !isNaN(iLon)
            const dist = hasPosition ? distanceNm(p.lat, p.lon, iLat, iLon) : null
            const keelDepth = !isNaN(keel) ? keel : null
            const threat = getThreat(dist, keelDepth, p.oceanDepth)

            return { ...p, dist, threat }
        })
    }, [platforms])

    const counts = useMemo(() => {
        return computed.reduce(
            (acc, p) => {
                if (p.threat !== 'pending') acc[p.threat]++
                return acc
            },
            { green: 0, yellow: 0, red: 0 }
        )
    }, [computed])

    const resolvedCount = counts.green + counts.yellow + counts.red

    return (
        <div className='task-layout iceberg-layout'>
            <div className='task-info-panel'>
                <div className='task-view-header'>
                    <div className='task-view-icon'>
                        <Gem size={42} />
                    </div>
                    <div>
                        <h2>ICEBERG TRACKING</h2>
                        <p>Threat assessment</p>
                    </div>
                </div>

                <div className='task-view-section'>
                    <span className='task-section-label'>Objective</span>
                    <p>
                        Determinar el nivel de amenaza (verde, amarillo, rojo) para cada
                        una de las cuatro plataformas, usando la posición del iceberg,
                        su calado, y la profundidad del agua en cada ubicación.
                    </p>
                </div>

                <div className='iceberg-stats'>
                    <div className='iceberg-stat'>
                        <span>Resolved</span>
                        <strong>{resolvedCount} / 4</strong>
                    </div>
                    <div className='iceberg-stat threat-green-bg'>
                        <span>Green</span>
                        <strong>{counts.green}</strong>
                    </div>
                    <div className='iceberg-stat threat-yellow-bg'>
                        <span>Yellow</span>
                        <strong>{counts.yellow}</strong>
                    </div>
                    <div className='iceberg-stat threat-red-bg'>
                        <span>Red</span>
                        <strong>{counts.red}</strong>
                    </div>
                </div>
            </div>

            <div className='task-info-panel iceberg-table-panel'>
                <table className='iceberg-table'>
                    <thead>
                        <tr>
                            <th>Platform</th>
                            <th>Depth (m)</th>
                            <th>Iceberg Lat</th>
                            <th>Iceberg Lon</th>
                            <th>Keel (m)</th>
                            <th>Distance (nm)</th>
                            <th>Threat</th>
                        </tr>
                    </thead>
                    <tbody>
                        {computed.map(p => (
                            <tr key={p.id}>
                                <td className='iceberg-platform-name'>{p.name}</td>
                                <td className='iceberg-readonly'>{p.oceanDepth}</td>
                                <td>
                                    <input
                                        className='iceberg-input'
                                        type='number'
                                        step='0.0001'
                                        placeholder='lat'
                                        value={p.icebergLat}
                                        onChange={e => update(p.id, 'icebergLat', e.target.value)}
                                    />
                                </td>
                                <td>
                                    <input
                                        className='iceberg-input'
                                        type='number'
                                        step='0.0001'
                                        placeholder='lon'
                                        value={p.icebergLon}
                                        onChange={e => update(p.id, 'icebergLon', e.target.value)}
                                    />
                                </td>
                                <td>
                                    <input
                                        className='iceberg-input iceberg-input-sm'
                                        type='number'
                                        step='1'
                                        placeholder='m'
                                        value={p.keelDepth}
                                        onChange={e => update(p.id, 'keelDepth', e.target.value)}
                                    />
                                </td>
                                <td className='iceberg-readonly'>
                                    {p.dist !== null ? p.dist.toFixed(2) : '—'}
                                </td>
                                <td>
                                    <span className={`threat-badge threat-${p.threat}`}>
                                        {p.threat === 'pending' ? 'pending' : p.threat}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
