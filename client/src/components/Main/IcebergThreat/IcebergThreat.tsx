import { useState, useMemo } from 'react'
import './IcebergThreat.css'
import { Gem, Plus, Trash2 } from 'lucide-react'

type Platform = { name: string; lat: number; lon: number; depth: number }

const PLATFORMS: Platform[] = [
    { name: 'Hibernia', lat: 46.7504, lon: -48.7819, depth: 78 },
    { name: 'Sea Rose', lat: 46.7895, lon: -48.1417, depth: 107 },
    { name: 'Terra Nova', lat: 46.4, lon: -48.4, depth: 91 },
    { name: 'Hebron', lat: 46.544, lon: -48.498, depth: 93 },
]

type Report = {
    id: number
    latDeg: number; latMin: number; latSec: number
    lonDeg: number; lonMin: number; lonSec: number
    heading: number
    keel: number
}

function dmsToDecimal(deg: number, min: number, sec: number, negative: boolean) {
    const val = deg + min / 60 + sec / 3600
    return negative ? -val : val
}

// xy in nautical miles relative to (refLat, refLon)
function toXY(lat: number, lon: number, refLat: number, refLon: number) {
    const x = (lon - refLon) * 60 * Math.cos((refLat * Math.PI) / 180) // east+
    const y = (lat - refLat) * 60 // north+
    return { x, y }
}

function computeThreats(latDec: number, lonDec: number, heading: number, keel: number) {
    const dirRad = (heading * Math.PI) / 180
    const dirX = Math.sin(dirRad)
    const dirY = Math.cos(dirRad)

    return PLATFORMS.map(p => {
        const { x, y } = toXY(p.lat, p.lon, latDec, lonDec)
        let t = x * dirX + y * dirY
        if (t < 0) t = 0 // ray only moves forward from current position
        const closestX = t * dirX
        const closestY = t * dirY
        const dist = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2)

        const groundingThreshold = p.depth * 1.1
        let threat: 'green' | 'yellow' | 'red'
        let note = ''

        if (keel >= groundingThreshold) {
            threat = 'green'
            note = 'grounds before reaching platform'
        } else if (dist > 10) {
            threat = 'green'
        } else if (dist >= 5) {
            threat = 'yellow'
        } else {
            threat = 'red'
        }

        return { platform: p.name, dist, threat, note }
    })
}

export default function IcebergThreat() {
    const [latDeg, setLatDeg] = useState('')
    const [latMin, setLatMin] = useState('')
    const [latSec, setLatSec] = useState('0')
    const [lonDeg, setLonDeg] = useState('')
    const [lonMin, setLonMin] = useState('')
    const [lonSec, setLonSec] = useState('0')
    const [heading, setHeading] = useState('')
    const [keel, setKeel] = useState('')

    const [reports, setReports] = useState<Report[]>([])

    const current = useMemo(() => {
        const ld = parseFloat(latDeg), lm = parseFloat(latMin), ls = parseFloat(latSec) || 0
        const od = parseFloat(lonDeg), om = parseFloat(lonMin), os = parseFloat(lonSec) || 0
        const hd = parseFloat(heading), kd = parseFloat(keel)

        if ([ld, lm, od, om, hd, kd].some(v => isNaN(v))) return null

        const latDec = dmsToDecimal(ld, lm, ls, false) // North
        const lonDec = dmsToDecimal(od, om, os, true)  // West

        return { latDec, lonDec, heading: hd, keel: kd, threats: computeThreats(latDec, lonDec, hd, kd) }
    }, [latDeg, latMin, latSec, lonDeg, lonMin, lonSec, heading, keel])

    const saveReport = () => {
        const ld = parseFloat(latDeg), lm = parseFloat(latMin), ls = parseFloat(latSec) || 0
        const od = parseFloat(lonDeg), om = parseFloat(lonMin), os = parseFloat(lonSec) || 0
        const hd = parseFloat(heading), kd = parseFloat(keel)
        if ([ld, lm, od, om, hd, kd].some(v => isNaN(v))) return

        setReports(prev => [...prev, {
            id: Date.now(),
            latDeg: ld, latMin: lm, latSec: ls,
            lonDeg: od, lonMin: om, lonSec: os,
            heading: hd, keel: kd
        }])
    }

    const removeReport = (id: number) => setReports(prev => prev.filter(r => r.id !== id))

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

                <div className='il-form-section'>
                    <span className='task-section-label'>Position (DMS)</span>
                    <div className='il-dms-row'>
                        <input className='il-input il-input-sm' type='number' placeholder='°' value={latDeg} onChange={e => setLatDeg(e.target.value)} />
                        <input className='il-input il-input-sm' type='number' placeholder="'" value={latMin} onChange={e => setLatMin(e.target.value)} />
                        <input className='il-input il-input-sm' type='number' placeholder='"' value={latSec} onChange={e => setLatSec(e.target.value)} />
                        <span className='il-dms-label'>N</span>
                    </div>
                    <div className='il-dms-row'>
                        <input className='il-input il-input-sm' type='number' placeholder='°' value={lonDeg} onChange={e => setLonDeg(e.target.value)} />
                        <input className='il-input il-input-sm' type='number' placeholder="'" value={lonMin} onChange={e => setLonMin(e.target.value)} />
                        <input className='il-input il-input-sm' type='number' placeholder='"' value={lonSec} onChange={e => setLonSec(e.target.value)} />
                        <span className='il-dms-label'>W</span>
                    </div>
                </div>

                <div className='il-form-section'>
                    <span className='task-section-label'>Heading / Keel</span>
                    <div className='il-dms-row'>
                        <input className='il-input' type='number' placeholder='Heading °' value={heading} onChange={e => setHeading(e.target.value)} />
                        <input className='il-input' type='number' placeholder='Keel (m)' value={keel} onChange={e => setKeel(e.target.value)} />
                    </div>
                </div>

                <button className='il-save-btn' onClick={saveReport}>
                    <Plus size={14} />
                    Save to log
                </button>
            </div>

            <div className='task-info-panel il-results-panel'>
                <span className='task-section-label'>Platform threat levels</span>

                {!current ? (
                    <div className='il-empty'>Enter a position, heading, and keel depth to calculate</div>
                ) : (
                    <div className='il-cards'>
                        {current.threats.map(t => (
                            <div key={t.platform} className={`il-card il-card-${t.threat}`}>
                                <span className='il-card-name'>{t.platform}</span>
                                <span className={`threat-badge threat-${t.threat}`}>{t.threat}</span>
                                <span className='il-card-dist'>{t.dist.toFixed(2)} nm</span>
                                {t.note && <span className='il-card-note'>{t.note}</span>}
                            </div>
                        ))}
                    </div>
                )}

                {reports.length > 0 && (
                    <>
                        <span className='task-section-label il-log-label'>Logged reports</span>
                        <div className='il-log-table-wrap'>
                            <table className='il-log-table'>
                                <thead>
                                    <tr>
                                        <th>Position</th>
                                        <th>Hdg</th>
                                        <th>Keel</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reports.map(r => (
                                        <tr key={r.id}>
                                            <td>{r.latDeg}°{r.latMin}'{r.latSec}"N, {r.lonDeg}°{r.lonMin}'{r.lonSec}"W</td>
                                            <td>{r.heading}°</td>
                                            <td>{r.keel}m</td>
                                            <td>
                                                <button className='il-remove' onClick={() => removeReport(r.id)}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}