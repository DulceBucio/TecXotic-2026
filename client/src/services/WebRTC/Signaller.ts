import type { Answer, Message } from "../../types/Signalling"
import { type CameraStream } from "../../types/CameraStream"

type OnOpenCallback = (event: Event) => void
type OnStatusChangeCallback = (status: string) => void
type OnAvailableStreamsCallback = (streams: Array<CameraStream>) => void
type OnConsumerIdReceivedCallback = (consumer_id: string) => void
type OnSessionIdReceivedCallback = (session_id: string) => void
type OnSessionEndCallback = (session_id: string, reason: string) => void
type OnIceNegotiationCallback = (candidate: RTCIceCandidateInit) => void
type OnMediaNegotiationCallback = (description: RTCSessionDescriptionInit) => void

/* An abstraction for the Mavlink Camera Manager WebRTC Signaller
Websocket transport layer between client and BlueOS */
export class Signaller {
    private ws!: WebSocket
    public onOpen?: OnOpenCallback
    public onStatusChange?: OnStatusChangeCallback
    private url: URL
    public listeners: Map<
        keyof WebSocketEventMap,
        Map<(type: WebSocketEventMap[keyof WebSocketEventMap]) => void, boolean | AddEventListenerOptions | undefined>
    >
    private shouldReconnect: boolean

    private boundOnOpen = this.onOpenCallback.bind(this)
    private boundOnClose = this.onCloseCallback.bind(this)
    private boundOnError = this.onErrorCallback.bind(this)



    private sessionRegistry = new Map<
        string, 
        {
            consumerId: string
            producerId: string
            onIce?: OnIceNegotiationCallback
            onMedia?: OnMediaNegotiationCallback
        }
    >()

    constructor(url: URL, shouldReconnect: boolean, onOpen?: OnOpenCallback, onStatusChange?: OnStatusChangeCallback) {
        this.onOpen = onOpen
        this.onStatusChange = onStatusChange
        this.listeners = new Map()
        this.shouldReconnect = shouldReconnect
        this.url = url

        const status = `Connecting to signalling server on ${url}`
        console.debug('[WebRTC] [Signaller] ' + status)
        this.onStatusChange?.(status)

        try { 
            this.ws = this.connect()
        } catch (error) {
            console.error(`Could not stablish initial connection: ${error}`)
        }
    }

    public addEventListener<T extends keyof WebSocketEventMap>(
        type: T, listener: (event: WebSocketEventMap[T]) => void, options?: boolean | AddEventListenerOptions
    ): void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Map())
        }

        this.listeners.get(type)!.set(listener as (type: WebSocketEventMap[keyof WebSocketEventMap]) => void, options)
        this.ws.addEventListener(type, listener, options)
    }

    public removeEventListener<T extends keyof WebSocketEventMap>(
        type: T,
        listener: (event: WebSocketEventMap[T]) => void,
        options?: boolean | AddEventListenerOptions
      ): void {
        this.ws.removeEventListener(type, listener, options)
    
        if (!this.listeners.has(type)) {
          return
        }
    
        const selectedListeners = this.listeners.get(type)!
        if (!selectedListeners.has(listener as (type: WebSocketEventMap[keyof WebSocketEventMap]) => void)) {
          console.warn(
            `[WebRTC] [Signaller] Failed removing listener named ${listener.name} of type "${type}". Reason: not found`
          )
          return
        }
    
        const storedOptions = selectedListeners.get(listener as (type: WebSocketEventMap[keyof WebSocketEventMap]) => void)
        if (options && storedOptions && options !== storedOptions) {
          return
        }
        selectedListeners.delete(listener as (type: WebSocketEventMap[keyof WebSocketEventMap]) => void)
      }

    public removeAllListeners<T extends keyof WebSocketEventMap>(
        type: T, removeFromListeners: boolean): void {
            if (!this.listeners.size || !this.listeners.has(type)) {
                return
            }

            for (const [listener, options] of this.listeners.get(type)!) {
                this.ws.removeEventListener(type, listener, options)
            }

            if (removeFromListeners) {
                this.listeners.delete(type)
            }
        }

    public requestConsumerId(onConsumerIdReceived: OnConsumerIdReceivedCallback): void {
        const signaller = this
        this.addEventListener('message', function consumerIdListener(ev: MessageEvent): void {
            try {
                const message: Message = JSON.parse(ev.data)
                if (message.type !== 'answer') {
                    return
                }

                const answer: Answer = message.content
                if (answer.type !== 'peerId') {
                    return
                }

                signaller.removeEventListener('message', consumerIdListener)
                const consumerId: string = answer.content.id
                signaller.onStatusChange?.(`Consumer Id arrived: ${consumerId}`)
                onConsumerIdReceived(consumerId)
            } catch (error) {
                const errorMsg = `Failed receiving PeerId Answer Message. Error: ${error}. Data: ${ev.data}`
                console.error('[WebRTC] [Signaller] ' + errorMsg)
                signaller.onStatusChange?.(errorMsg)
            }
        })

        const message: Message = {
            type: 'question',
            content: {
                type: 'peerId'
            },
        }

        try {
            this.ws.send(JSON.stringify(message))
            signaller.onStatusChange?.('Consumer Id requested, waiting answer')
        } catch (reason) {
            const error = `Failed requesting peer id. Reason: ${reason}`
            console.error('[WebRTC] [Signaller] ' + error)
            signaller.onStatusChange?.(error)
        }
    }

    public isConnected(): boolean {
        return this.ws.readyState === this.ws.OPEN
    }

    public requestSessionId(
        consumerId: string,
        producerId: string,
        onSessionReceived: OnSessionIdReceivedCallback
    ): void {
        const signaller = this
        signaller.addEventListener('message', function sessionStartListener(ev: MessageEvent): void {
            try {
                const message: Message = JSON.parse(ev.data)
                if (message.type !== 'answer') {
                    return
                }

                const answer: Answer = message.content
                if (answer.type !== 'startSession') {
                    return
                }

                const sessionId = answer.content.session_id
                if(sessionId === undefined) {
                    return
                }

                signaller.removeEventListener('message', sessionStartListener)
                signaller.onStatusChange?.(`Session Id arrived: ${sessionId}`)
                onSessionReceived(sessionId)
            } catch (error) {
                const errorMsg = `Failed receiving StartSession Answer Message. Error: ${error}. Data: ${ev.data}`
                console.error('[WebRTC] [Signaller]' + errorMsg)
                signaller.onStatusChange?.(errorMsg)
                return
            }
        })

        const message: Message = {
            type: 'question', 
            content: {
                type: 'startSession',
                content: {
                    consumer_id: consumerId,
                    producer_id: producerId
                }
            }
        }

        try {
            this.ws.send(JSON.stringify(message))
            signaller.onStatusChange?.('Session Id requested, waiting answer...')
        } catch (reason) {
            const error = `Failed requesting session id: ${reason}`
            console.error('[WebRTC] [Signaller] ' + error)
            signaller.onStatusChange?.(error)
        }
    }

    public sendIceNegotiation(sessionId: string, consumerId: string, 
        producerId: string, ice: RTCIceCandidate
    ): void {
        const message: Message = {
            type: 'negotiation',
            content: {
                type: 'iceNegotiation',
                content: {
                    session_id: sessionId,
                    consumer_id: consumerId,
                    producer_id: producerId,
                    ice: ice.toJSON()
                }
            }
        }

        console.debug(`[WebRTC] [Signaller] Sending ICE answer: ${JSON.stringify(message, null, 4)}`)
        try {
            this.ws.send(JSON.stringify(message))
            this.onStatusChange?.('ICE Candidate sent')
        } catch (error) {
            const errorMsg = `Failed sending ICE Candidate. Reason: ${error}`
            console.error('[WebRTC] [Signaller] ' + errorMsg)
            this.onStatusChange?.(errorMsg)
        }
    }

    public sendMediaNegotiation(
        sessionId: string, consumerId: string, producerId: string, sdp: RTCSessionDescriptionInit
    ): void {
        const message: Message = {
            type: 'negotiation',
            content: {
                type: 'mediaNegotiation',
                content: {
                    session_id: sessionId,
                    consumer_id: consumerId,
                    producer_id: producerId,
                    sdp: sdp
                }
            }
        }

        try {
            this.ws.send(JSON.stringify(message))
            this.onStatusChange?.('ICE Candidate Sent')
        } catch (error) {
            const errorMsg = `Failed sending SDP. Reason: ${error}`
            console.error('[WebRTC] [Signaller] ' + errorMsg)
            this.onStatusChange?.(errorMsg)
        }
    }
    
    public parseEndSessionQuestion(
        consumerId: string, 
        producerId: string,
        sessionId: string,
        onSessionEnd: OnSessionEndCallback
    ): void {
        console.debug(
            '[WebRTC] [Signaller] Registering parseEndSessionQuestion callbacks for ' +
            `Consumer ${consumerId}, ` + `Producer ${producerId}, ` + `Session ${sessionId}`
        )

        const signaller = this
        this.addEventListener('message', function endSessionListener(ev: MessageEvent): void {
            try {
                const message: Message = JSON.parse(ev.data)
                if (message.type !== 'question') {
                    return
                }

                const question = message.content
                if (question.type !== 'endSession') {
                    return
                }

                const endSessionQuestion = question.content
                if (
                    endSessionQuestion.consumer_id !== consumerId ||
                    endSessionQuestion.producer_id !== producerId || 
                    endSessionQuestion.session_id !== sessionId
                ) {
                    return
                }

                signaller.removeEventListener('message', endSessionListener)

                const reason = endSessionQuestion.reason
                signaller.onStatusChange?.('EndSession arrived')
                onSessionEnd?.(sessionId, reason)
            } catch (error) {
                const errorMsg = `Failed parsing received Message. Error: ${error}. Data: ${ev.data}`
                console.error('[WebRTC] [Signaller] ' + errorMsg)
                signaller.onStatusChange?.(errorMsg)
                return
            }
        })
    }
    
    public registerSession(
        sessionId: string,
        consumerId: string, 
        producerId: string,
        onIce?: OnIceNegotiationCallback,
        onMedia?: OnMediaNegotiationCallback
    ): void {
        this.sessionRegistry.set(sessionId, {
            consumerId,
            producerId,
            onIce,
            onMedia
        })
    }

    public unregisterSession(sessionId: string): void {
        this.sessionRegistry.delete(sessionId)
    }

    public parseAvailableStreamAnswer(onAvailableStreams: OnAvailableStreamsCallback): void {
        const signaller = this
        this.addEventListener('message', function availableStreamListener(ev: MessageEvent): void {
            try {
                const message: Message = JSON.parse(ev.data)
                if (message.type !== 'answer') {
                    return
                }

                const answer: Answer = message.content
                if (answer.type !== 'availableStreams') {
                    return
                }

                signaller.removeEventListener('message', availableStreamListener)

                const streams: Array<CameraStream> = answer.content
                signaller.onStatusChange?.('Available Streams arrived')
                onAvailableStreams?.(streams)
            } catch (error) {
                const errorMsg = `Failed parsing received message. Error: ${error}. Data: ${ev.data}`
                console.error('[WebRTC] [Signaller] ' + errorMsg)
                signaller.onStatusChange?.(errorMsg)
                return
            }
        })
    }

    private handleMessage(ev: MessageEvent): void {
        try {
            const message: Message = JSON.parse(ev.data)

            if (message.type !== 'negotiation') {
                return
            }

            const negotiation = message.content
            const sessionId = negotiation.content.session_id
            const consumerId = negotiation.content.consumer_id
            const producerId = negotiation.content.producer_id

            const session = this.sessionRegistry.get(sessionId)

            if (!session) {
                return
            }

            if (
                session.consumerId !== consumerId ||
                session.producerId !== producerId
            ) {
                return
            }

            switch (negotiation.type) {
                case 'iceNegotiation':
                    this.onStatusChange?.('ICE arrived')
                    session.onIce?.(negotiation.content.ice)
                    break

                case 'mediaNegotiation':
                    this.onStatusChange?.('SDP arrived')
                    session.onMedia?.(negotiation.content.sdp)
                    break
            }

        } catch (error) {
            console.error('[WebRTC] [Signaller] Failed parsing message', error)
        }
    }

    public end(reason: string): void {
        this.ws.removeEventListener('open', this.boundOnOpen)
        this.ws.removeEventListener('error', this.boundOnError)
        this.ws.removeEventListener('close', this.boundOnClose)

        this.removeAllListeners('open', false)
        this.removeAllListeners('error', false)
        this.removeAllListeners('close', false)
        this.removeAllListeners('message', false)

        if (this.ws.readyState !== this.ws.OPEN) {
            return
        }

        console.debug(`[WebRTC] [Signaller] Closing WebSocket. Reason: ${reason}`)
        this.ws.close()
    }

    private connect(): WebSocket {
        const ws = new WebSocket(this.url.toString())

        ws.addEventListener('open', this.boundOnOpen)
        ws.addEventListener('error', this.boundOnError)
        ws.addEventListener('close', this.boundOnClose)

        ws.addEventListener('message', (ev: MessageEvent) => {
            this.handleMessage(ev)
        })

        return ws
    }

    private reconnect(): void {
        const status = `Reconnecting to signalling`
        console.debug('[WebRTC] [Signaller] '  + status)
        this.onStatusChange?.(status)

        this.end('reconnect')

        const oldWs = this.ws
        
        oldWs.onclose = null
        oldWs.onopen = null
        oldWs.onmessage = null
        oldWs.onmessage = null

        try {
            this.ws = this.connect()
        } catch (error) {
            console.error(`[WebRTC] [Signaller] Could not reconnect ${error}`)
        }
    }

    private onOpenCallback(event: Event): void {
        const status = `Signaller Connected`
        console.debug('[WebRTC] [Signaller] ' + status, event)
        this.onStatusChange?.(status)

        this.onOpen?.(event)
    }

    private onCloseCallback(event: CloseEvent): void {
        const status = `Signaller connection closed`
        console.debug('[WebRTC] [Signaller] ' + status, event)
        this.onStatusChange?.(status)

        if (this.shouldReconnect) {
            setTimeout(() => {
                if (this.ws.readyState === this.ws.CLOSED || this.ws.readyState === this.ws.CLOSING) {
                    this.reconnect()
                }
            }, 1000)
        }
    }

    private onErrorCallback(event: Event): void {
        const status = `Signaller connection error`
        console.debug('[WebRTC] [Signaller] ' + status, event)
        this.onStatusChange?.(status)
    }
}