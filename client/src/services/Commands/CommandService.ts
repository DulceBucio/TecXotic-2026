export class CommandService {
    public ws!: WebSocket

    public connect(url:string) {
        this.ws = new WebSocket(url)

        this.ws.onopen = () => {
            console.log('[Command Service] Connected vehicle')
        }

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            console.log('[Command Service] From vehicle: ', data)
        }
    }

    public send(data: any) {
        if(this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data))
        }
    }
}