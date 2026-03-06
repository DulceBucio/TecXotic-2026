import { Session } from "./Session";
import { Signaller } from "./Signaller";
import { type CameraStream } from "../../types/CameraStream";
import { CameraManagerService } from "../CameraManager/CameraManagerService";

export interface WebRTCManagerCallbacks {
    onAvailableStreams?: (streams: CameraStream[]) => void
    onAvailableICEIPs?: (ips: string[]) => void
    onMediaStream?: (media: MediaStream | undefined) => void
    onSignallerStatus?: (status: string) => void
    onStreamStatus?: (status: string) => void
    onConnected?: (connected: boolean) => void
}
  

export class WebRTCManager {
    private callbacks: WebRTCManagerCallbacks
    private consumerId?: string
    private streamName?: string
    public session?: Session
    private rtcConfiguration: RTCConfiguration
    private selectedICEIPs: string[] = []
    private selectedICEProtocols: string[] = []
    private jitterBufferTarget = 0

    private hasEnded = false
    private signaller: Signaller
    private waitingForAvailableStreamAnswer = false
    private waitingForSessionStart = false
    private streamInfoService = new CameraManagerService()

    constructor(
        webRTCSignallingURI: URL, rtcConfiguration: RTCConfiguration, callbacks: WebRTCManagerCallbacks = {}
    ) {
        this.callbacks = callbacks
        this.rtcConfiguration = rtcConfiguration
        this.signaller = new Signaller(
            webRTCSignallingURI, true, (): void => {
                this.startConsumer()
            },
            (status: string): void => this.updateSignallerStatus(status)
        )
    }

    public close(reason: string): void {
        this.stopSession(reason)
        this.signaller.end(reason)
        this.hasEnded = true
    }

    public startStream(
        selectedStream: CameraStream | undefined, selectedICEIPs: string[], selectedICEProtocols: string[], jitterBufferTarget: number
    ): void {
        this.selectedICEIPs = selectedICEIPs
        this.selectedICEProtocols = selectedICEProtocols
        this.jitterBufferTarget = jitterBufferTarget

        if (!selectedStream) return
        this.startSession(selectedStream)
    }

    private updateStreamStatus(newStatus: string): void {
        const time = new Date().toTimeString().split(' ')[0]
        const formatted = `${newStatus} (${time})`
        this.callbacks.onStreamStatus?.(formatted)
    }

    private updateSignallerStatus(newStatus: string): void {
        const time = new Date().toTimeString().split(' ')[0]
        const formatted = `${newStatus} (${time})`
        this.callbacks.onSignallerStatus?.(formatted)
    }

    private startConsumer(): void {
        this.hasEnded = false
        if (this.consumerId === undefined) {
            this.signaller.requestConsumerId((newConsumerId: string): void => {
                this.consumerId = newConsumerId
            })
        }

        this.callbacks.onAvailableStreams?.([])
        this.updateStreamsAvailable()
    }

    private async updateStreamsAvailable(): Promise<void> {
        if (this.waitingForAvailableStreamAnswer || this.hasEnded) {
            return
        }

        this.waitingForAvailableStreamAnswer = true

        try {
            const streams = await this.streamInfoService.getStreams()
            this.callbacks.onAvailableStreams?.(streams)
        } catch (error) {
            console.error(`[WebRTC] [Manager] Failed to fetch streams: ${error}`)
        } finally {
            this.waitingForAvailableStreamAnswer = false
        }

        if (!this.hasEnded) {
            setTimeout(() => this.updateStreamsAvailable(), 2000)
        }
    }

    private onTrackAdded(event: RTCTrackEvent): void {
        const [remoteStream] = event.streams
        this.callbacks.onMediaStream?.(remoteStream)

        this.session?.setJitterBufferTarget(this.jitterBufferTarget)
        const videoTracks = remoteStream.getVideoTracks().filter((t) => t.kind === 'video')
        
        videoTracks.forEach((track) => {
            if (!('contentHint' in track)) {
                console.error('[WebRTC] MediaStreamTrack contentHint attribute not supported')
                return
            }

            track.contentHint = 'motion'
        })

        console.debug('[WebRTC] Track added')
        console.debug('Event: ', event)
        console.debug('Settings: ', event.track.getSettings?.())
        console.debug('Constraints: ', event.track.getConstraints?.())
        console.debug('Capabilities: ', event.track.getCapabilities?.())
    }

    private onPeerConnected(): void {
        this.callbacks.onConnected?.(true)
    }

    private endAllSessions(): void {
        if (this.session) {
            this.session.end()
        }
    }

    private requestSession(stream: CameraStream, consumerId: string): void {
        console.debug(`[WebRTC] Requesting stream: ${stream}`)

        this.signaller.requestSessionId(consumerId, stream.id, (receivedSessionId: string): void => {
            this.onSessionIdReceived(stream, stream.id, receivedSessionId)
        })

        this.hasEnded = false
    }

    private startSession(stream: CameraStream): void {
        if (this.session && this.session.hasEnded()) {
            console.debug('[WebRTC] Session already active')
            return
        }

        if (!this.consumerId) {
          this.updateStreamStatus("Cannot start session: consumerId missing")
          return
        }
      
        const msg = `Starting session with producer "${stream.id}"`
        console.debug('[WebRTC] ' + msg)
        this.updateStreamStatus(msg)
      
        this.requestSession(stream, this.consumerId)
    }

    private onSessionClosed(reason: string, stream: CameraStream): void {
        this.stopSession(reason)
    
        setTimeout(() => {
            if (!this.hasEnded) {
                this.startSession(stream)
            }
        }, 1000)
    }

    private onSessionIdReceived(stream: CameraStream, producerId: string, receivedSessionId: string): void {
        this.session = new Session(
            receivedSessionId, this.consumerId!, stream, this.signaller, this.rtcConfiguration, this.selectedICEIPs, 
            this.selectedICEProtocols, (event: RTCTrackEvent): void => this.onTrackAdded(event), (): void => this.onPeerConnected(),
            (availableICEIPS: string []) => (this.callbacks.onAvailableICEIPs?.(availableICEIPS)), (_sessionId, reason) => this.onSessionClosed(reason, stream),
            (status: string): void => this.updateStreamStatus(status)
        )

        this.signaller.parseEndSessionQuestion(this.consumerId!, producerId, this.session.id, (sessionId, reason) => {
            console.debug(`[WebRTC] [Session] ${sessionId} ended. Reason: ${reason}`)
            this.stopSession(reason)
        })

        this.signaller.registerSession(this.session.id, this.consumerId!, producerId, this.session.onIncomingICE.bind(this.session), 
            this.session.onIncomingSDP.bind(this.session)
        )

        const msg = `Session ${this.session.id} successfully started`
        console.debug('[WebRTC] ' + msg)
        this.updateStreamStatus(msg)
    }

    private stopSession(reason: string): void {
        if (this.session === undefined) {
            console.debug(`[WebRTC] Stopping an undefined session, probably it was already stopped?`)
            return
        }

        const msg = `Stopping session ${this.session.id}. Reason: ${reason}`
        this.updateStreamStatus(msg)
        console.debug('[WebRTC] ' + msg)

        this.session.end()
        this.session = undefined
        this.hasEnded = true 
        
        this.callbacks.onConnected?.(false)
        this.callbacks.onMediaStream?.(undefined)
    }
}
  
