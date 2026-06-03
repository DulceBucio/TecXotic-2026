import { controlStore } from '../../state/controlStore'

export class CommandService {
    public ws!: WebSocket

    public connect(url: string) {
        controlStore.setConnected(false)

        this.ws = new WebSocket(url)

        this.ws.onopen = () => {
            console.log('[Command Service] Connected vehicle')
            controlStore.setConnected(true)
        }

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            console.log('[Command Service] From vehicle: ', data)
        }

        this.ws.onerror = () => {
            console.log('[Command Service] Connection error')
            controlStore.setConnected(false)
        }

        this.ws.onclose = () => {
            console.log('[Command Service] Disconnected vehicle')
            controlStore.setConnected(false)
        }
    }

    public send(data: any) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data))
        }
    }
}