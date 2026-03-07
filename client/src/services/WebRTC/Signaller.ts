import type { Answer, Message, Negotiation } from "../../types/Signalling"
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
Websocket transport layer between client and BlueOS, 
refer to BlueRobotics Cockpit implementation:
https://github.com/bluerobotics/cockpit/blob/8ad4d4426f9ee4c07263b0ef456c0b222f519926/src/libs/webrtc/signaller.ts
*/

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
    
    private sessionRegistry = new Map<
        string, 
        {
            consumerId: string
            producerId: string
            onIce?: OnIceNegotiationCallback
            onMedia?: OnMediaNegotiationCallback
        }
    >()

    /** 
    * Creates a new Signaller instance and inmediately attemps to stablish a WebSocket connection with the Signalling server 
    * @param {URL} url of the signalling server
    * @param {boolean} shouldReconnect - If it should try to reconnect if the ws connection is lost
    * @param {OnOpenCallback} onOpen - An optional callback for when signalling opens its websocket connection
    * @param {OnStatusChangeCallback} onStatusChange - An optional callback for internal status change
    */
    constructor(url: URL, shouldReconnect: boolean, onOpen?: OnOpenCallback, onStatusChange?: OnStatusChangeCallback) {
        this.onOpen = onOpen
        this.onStatusChange = onStatusChange
        this.listeners = new Map()
        this.shouldReconnect = shouldReconnect
        this.url = url

        this.onOpenCallback = this.onOpenCallback.bind(this)
        this.onErrorCallback = this.onErrorCallback.bind(this)
        this.onCloseCallback = this.onCloseCallback.bind(this)

        const status = `Connecting to signalling server on ${url}`
        console.debug('[WebRTC] [Signaller] ' + status)
        this.onStatusChange?.(status)

        try { 
            this.ws = this.connect()
            this.addEventListener("message", (ev: MessageEvent) => {
                console.log("[SIGNALLER RAW MESSAGE]", ev.data)
            })
    
        } catch (error) {
            console.error(`Could not stablish initial connection: ${error}`)
        }

        
    }

    /**
     * To manage temporary websocket event listeners 
     * @param {keyof WebSocketEventMap} type 
     * @param {WebSocketEventMap} listener 
     * @param {boolean | AddEventListenerOptions } options 
     */
    public addEventListener<T extends keyof WebSocketEventMap>(
        type: T, listener: (event: WebSocketEventMap[T]) => void, options?: boolean | AddEventListenerOptions
    ): void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Map())
        }

        this.listeners.get(type)!.set(listener as (type: WebSocketEventMap[keyof WebSocketEventMap]) => void, options)
        this.ws.addEventListener(type, listener, options)
    }

    /**
     * Remove a specific websocket listener
     * @param {keyof WebSocketEventMap} type 
     * @param {WebSocketEventMap} listener 
     * @param {boolean | AddEventListenerOptions} options 
     * @returns 
     */
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

    /**
     * Removes all listener of specific type, used during shutdown
     * @param {string | undefined} type 
     * @param {boolean} removeFromListeners 
     * @returns 
     */
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

    /**
     * Request a unique peer ID from the signalling server
     * @param {OnConsumerIdReceivedCallback} onConsumerIdReceived - A callback for when the requested consumer id is received
     */
    public requestConsumerId(onConsumerIdReceived: OnConsumerIdReceivedCallback): void {
        console.log('[WebRTC] [Signaller] Requesting consumer ID')
        const signaller = this
        /* Attatch temporary message listener */
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
                console.log(`Consumer Id arrived: ${consumerId}`)
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

        // Send peerid question
        try {
            this.ws.send(JSON.stringify(message))
            signaller.onStatusChange?.('Consumer Id requested, waiting answer')
        } catch (reason) {
            const error = `Failed requesting peer id. Reason: ${reason}`
            console.error('[WebRTC] [Signaller] ' + error)
            signaller.onStatusChange?.(error)
        }
    }

    /**
     * whether or not websocket is open/connected
     * @returns {boolean} 
     */
    public isConnected(): boolean {
        return this.ws.readyState === this.ws.OPEN
    }

    /**
     * Requests the signalling server for a new session ID
     * @param {} consumerId - Unique ID of the consumer, given by the signalling server
     * @param {} producerId - Unique ID of the producer 
     * @param {} onSessionReceived - A callback for when the requested session id is received
     */

    public requestSessionId(
        consumerId: string,
        producerId: string,
        onSessionReceived: OnSessionIdReceivedCallback
    ): void {
        console.log('[WebRTC] [Signaller] Requesting session ID...', consumerId, producerId)
        const signaller = this
        // attatch temporary message listener
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
                console.log(`Session Id arrived: ${sessionId}`)
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

        // sends question 
        try {
            this.ws.send(JSON.stringify(message))
            signaller.onStatusChange?.('Session Id requested, waiting answer...')
        } catch (reason) {
            const error = `Failed requesting session id: ${reason}`
            console.error('[WebRTC] [Signaller] ' + error)
            signaller.onStatusChange?.(error)
        }
    }

    /**
     * Sends a local ICE candidate to the signalling server
     * @param {string} sessionId 
     * @param {string} consumerId 
     * @param {string} producerId 
     * @param {RTCIceCandidate} ice - The ICE candidate to be sent to the signalling server, provided by the client side (this)
     */
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

    /**
     * Send an SDP offer to the signalling server
     * @param {string} sessionId 
     * @param {string} consumerId 
     * @param {string} producerId 
     * @param {RTCSessionDescriptionInit} sdp - THE SDP to be sent to the signalling server, given by the client (here)
     */
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
    
    /**
     * Listens to a endSession question received by the signalling server
     * @param {string} consumerId 
     * @param {string} producerId 
     * @param {string} sessionId 
     * @param {OnSessionEndCallback} onSessionEnd - a callback for when an 'endSession' message is received
     */
    public parseEndSessionQuestion(
        consumerId: string, 
        producerId: string,
        sessionId: string,
        onSessionEnd: OnSessionEndCallback
    ): void {
        console.log(
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
    
    /**
     * Registers a session in the internal routing registry
     * @param {string} sessionId 
     * @param {string} consumerId 
     * @param {string} producerId 
     * @param {OnIceNegotiationCallback} onIce 
     * @param {OnMediaNegotiationCallback} onMedia 
     */
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

    /**
     * Removes session from routing registry
     * @param {string} sessionId 
     */
    public unregisterSession(sessionId: string): void {
        this.sessionRegistry.delete(sessionId)
    }

    /**
     * Waits for server response listing available camera streams
     * @param {OnAvailableStreamsCallback} onAvailableStreams - callback for when answer is received
     */
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

    public parseNegotiation(
        consumerId: string,
        producerId: string,
        sessionId: string,
        onIceNegotiation?: OnIceNegotiationCallback,
        onMediaNegotiation?: OnMediaNegotiationCallback
    ): void {
        console.debug('[WebRTC] [Signaller] Registering parseNegotiation callbacks for ' +
            `Consumer ${consumerId}, ` + `Producer ${producerId}, ` + `Session ${sessionId}` 
        )
        this.addEventListener('message', (ev: MessageEvent): void => {
            try {
                const message: Message = JSON.parse(ev.data)

                if (message.type !== 'negotiation') {
                    return
                }

                const negotiation: Negotiation = message.content

                if (
                    negotiation.content.consumer_id !== consumerId ||
                    negotiation.content.producer_id !== producerId ||
                    negotiation.content.session_id !== sessionId
                ) {
                    return
                }

                switch (negotiation.type) {
                    case 'iceNegotiation':
                        this.onStatusChange?.('iceNegotiation arrived')
                        onIceNegotiation?.(negotiation.content.ice)
                        break
                    case 'mediaNegotiation':
                        this.onStatusChange?.('mediaNegotiation arrived')
                        onMediaNegotiation?.(negotiation.content.sdp)
                        break
                }
            } catch (error) {
                const errorMsg = `Failed parsing received message. Error: ${error}. Data: ${ev.data}`
                console.error('[WebRTC] [Signaller] ' + errorMsg)
                this.onStatusChange?.(errorMsg)
                return
            }
        })
    }

    private handleMessage(ev: MessageEvent): void {
        try {
            const message: Message = JSON.parse(ev.data)

            switch(message.type) {
                case 'answer':
                    console.log('[WebRTC] [Signaller] Answer received: ', message)
                    break
                case 'negotiation':
                    this.handleNegotiation(message.content)
                    break
            }
        } catch (error) {
            console.error('[WebRTC] [Signaller] Error: ', error)
        }
    }
    
    /**
     * Central router negotiation for messages
     * @param {MessageEvent} ev 
     * @returns 
     */
    private handleNegotiation(content: any): void {
        try {
            const negotiation = content
            const sessionId = content.session_id
            const consumerId = content.consumer_id
            const producerId = content.producer_id

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

    /**
     * Gracefully shut downs and cleans up the registered callbacks
     * @param {string} reason - the id of the caller
     * @returns 
     */
    public end(reason: string): void {
    
        this.ws.removeEventListener('open', this.onOpenCallback)
        this.ws.removeEventListener('error', this.onErrorCallback)
        this.ws.removeEventListener('close', this.onCloseCallback)

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

    /**
     * Creates and configures a new websocket connection 
     * @returns {WebSocket} - the websocket object for signalling connection
     */
    private connect(): WebSocket {

        const ws = new WebSocket(this.url.toString())
    
        console.log('[WebRTC] [Signaller] Opening WebSocket')
    
        const openHandler = (e: Event) => this.onOpenCallback(e)
        const closeHandler = (e: CloseEvent) => this.onCloseCallback(e)
        const errorHandler = (e: Event) => this.onErrorCallback(e)
    
        console.log("ATTACHING OPEN LISTENER", openHandler)
    
        ws.addEventListener("open", openHandler)
        ws.addEventListener("close", closeHandler)
        ws.addEventListener("error", errorHandler)
    
        return ws
    }
    
    /**
     * Re-stablishes websocket connection after disconnection
     */
    private reconnect(): void {
        const status = `Reconnecting to signalling`
        console.debug('[WebRTC] [Signaller] '  + status)
        this.onStatusChange?.(status)

        this.end('reconnect')

        // Closes previous socket safely
        const oldWs = this.ws
        
        oldWs.onclose = null
        oldWs.onopen = null
        oldWs.onmessage = null
        oldWs.onmessage = null


        // attempt new connection
        try {
            this.ws = this.connect()
        } catch (error) {
            console.error(`[WebRTC] [Signaller] Could not reconnect ${error}`)
        }
    }

    /**
     * internal lifecycle handler for websocket
     * @param {Event} event 
     */
    private onOpenCallback(event: Event): void {
        console.log("CLASS OPEN HANDLER", this.ws)
        const status = `Signaller Connected`
        console.debug('[WebRTC] [Signaller] ' + status, event)
        this.onStatusChange?.(status)

        this.onOpen?.(event)
    }

    /**
     * internal lifecycle handler for websocket
     * @param {Event} event 
     */
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

    /**
     * internal lifecycle handler for websocket
     * @param {Event} event 
     */
    private onErrorCallback(event: Event): void {
        const status = `Signaller connection error`
        console.debug('[WebRTC] [Signaller] ' + status, event)
        this.onStatusChange?.(status)
    }
}