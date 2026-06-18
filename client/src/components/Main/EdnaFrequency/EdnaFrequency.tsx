import { useState, useMemo } from 'react'
import './EdnaFrequency.css'
import { FlaskConical, Plus, Trash2 } from 'lucide-react'

type Entry = { id: number; species: string; count: number }

export default function EdnaFrequency() {
    const [entries, setEntries] = useState<Entry[]>([])
    const [species, setSpecies] = useState('')
    const [count, setCount] = useState('')

    const total = useMemo(() => entries.reduce((s, e) => s + e.count, 0), [entries])
    const sorted = useMemo(() => [...entries].sort((a, b) => b.count - a.count), [entries])
    const dominant = sorted[0]?.species.split(' ').slice(0, 2).join(' ') ?? '—'

    const add = () => {
        const n = parseInt(count)
        if (!species.trim() || isNaN(n) || n < 0) return
        setEntries(prev => [...prev, { id: Date.now(), species: species.trim(), count: n }])
        setSpecies('')
        setCount('')
    }

    const remove = (id: number) => setEntries(prev => prev.filter(e => e.id !== id))

    const exportTSV = () => {
        const rows = ['Species\tNo. seen\t% frequency',
            ...sorted.map(e => `${e.species}\t${e.count}\t${total > 0 ? (e.count / total * 100).toFixed(2) : '0.00'}%`),
            `TOTAL\t${total}\t100.00%`
        ].join('\n')
        navigator.clipboard.writeText(rows)
    }

    return (
        <div className='task-layout edna-layout'>
            <div className='task-info-panel edna-info'>
                <div className='task-view-header'>
                    <div className='task-view-icon'>
                        <FlaskConical size={42} />
                    </div>
                    <div>
                        <h2>FREQUENCY</h2>
                        <p>eDNA Analysis</p>
                    </div>
                </div>

                <div className='edna-stats'>
                    <div className='edna-stat'>
                        <span>Species</span>
                        <strong>{entries.length}</strong>
                    </div>
                    <div className='edna-stat'>
                        <span>Total seen</span>
                        <strong>{total}</strong>
                    </div>
                    <div className='edna-stat edna-stat-wide'>
                        <span>Dominant</span>
                        <strong>{dominant}</strong>
                    </div>
                </div>

                <div className='edna-add-row'>
                    <input
                        className='edna-input'
                        placeholder='Species name'
                        value={species}
                        onChange={e => setSpecies(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && document.getElementById('edna-count')?.focus()}
                    />
                    <input
                        id='edna-count'
                        className='edna-input edna-input-sm'
                        type='number'
                        placeholder='Seen'
                        min={0}
                        value={count}
                        onChange={e => setCount(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && add()}
                    />
                    <button className='edna-add-btn' onClick={add}>
                        <Plus size={14} />
                    </button>
                </div>
            </div>

            <div className='task-info-panel edna-table-panel'>
                {entries.length === 0 ? (
                    <div className='edna-empty'>Add your first species on the left</div>
                ) : (
                    <table className='edna-table'>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Species</th>
                                <th>Seen</th>
                                <th>% Freq</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((e, i) => {
                                const pct = total > 0 ? (e.count / total * 100) : 0
                                return (
                                    <tr key={e.id}>
                                        <td className='edna-idx'>{i + 1}</td>
                                        <td>{e.species}</td>
                                        <td>{e.count}</td>
                                        <td>
                                            <div className='edna-bar-wrap'>
                                                <div className='edna-bar-track'>
                                                    <div className='edna-bar-fill' style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className='edna-pct'>{pct.toFixed(2)}%</span>
                                            </div>
                                        </td>
                                        <td>
                                            <button className='edna-remove' onClick={() => remove(e.id)}>
                                                <Trash2 size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className='task-view-actions'>
                <button className='task-action-btn' onClick={exportTSV}>
                    Export TSV
                </button>
            </div>
        </div>
    )
}