import type { Signaller } from "./Signaller";
import { type CameraStream } from "../../types/CameraStream";

type OnCloseCallback = (sessionId: string, reason: string) => void
type OnTrackAddedCallback = (event: RTCTrackEvent) => void
type OnNewIceRemoteAddressCallback = (availableICEIps: string[]) => void
type OnStatusChangeCallback = (status: string) => void
type OnPeerConnectedCallback = () => void

/**
 * An abstraction for the Mavlink Camera Manager WebRTC Session
 * refer to cockpit's implementation: 
 */

export class Session {
    public id!: string
    public consumerId!: string
    public stream!: CameraStream
    public status!: string
    public ended!: boolean
    public signaller!: Signaller
    public peerConnection!: RTCPeerConnection
    public availableICEIPs!: string[]
    public selectedICEIPs!: string[]
    public selectedICEProtocols!: string[]
    public rtcConfiguration!: RTCConfiguration
    public onTrackAdded?: OnTrackAddedCallback
    public onPeerConnected?: OnPeerConnectedCallback
    public onNewIceRemoteAddress?: OnNewIceRemoteAddressCallback
    public onClose?: OnCloseCallback
    public onStatusChange?: OnStatusChangeCallback

    private boundOnIceCandidate = this.onIceCandidate.bind(this)
    private boundOnNegotiationNeeded = this.onNegotiationNeeded.bind(this)
    private boundOnTrack = this.onTrackAddedCallback.bind(this)
    private boundOnIceCandidateError = this.onIceCandidateError.bind(this)
    private boundOnIceConnectionStateChange = this.onIceConnectionStateChange.bind(this)
    private boundOnConnectionStateChange = this.onConnectionStateChange.bind(this)
    private boundOnSignalingStateChange = this.onSignalingStateChange.bind(this)
    private boundOnIceGatheringStateChange = this.onIceGatheringStateChange.bind(this)

    /**
     * Creates a new Session connecting with given Camera Stream and stores meta data  
     * @param {string} sessionId - unique id of the session given by the signalling server
     * @param {string} consumerId 
     * @param {CameraStream} stream - the stream instance of which the Session will be created with
     * @param {Signaller} signaller - Signaller instance for the Session to use (routing)
     * @param {RTCConfiguration} rtcConfiguration - Configuration for the RTC Connection such as Turn and Stun servers
     * @param {string[]} selectedICEIPs - whitelist for ICE IP addresses
     * @param {string[]} selectedICEProtocols - whitelist for protocols allowed
     * @param {OnTrackAddedCallback} onTrackAdded - optional callback for when a track is added to the session
     * @param {OnPeerConnectedCallback} onPeerConnected - an optional callback for when the peer is connected
     * @param {OnNewIceRemoteAddressCallback} onNewIceRemoteAddress - an optional callback for when a new ICE candidate IP address is available
     * @param {OnCloseCallback} onClose - option callback for when the session closes
     * @param {OnStatusChangeCallback} onStatusChange - optional callback for internal status change
     */
    constructor(
        sessionId: string,
        consumerId: string,
        stream: CameraStream,
        signaller: Signaller,
        rtcConfiguration: RTCConfiguration,
        selectedICEIPs: string[] = [],
        selectedICEProtocols: string[] = [],
        onTrackAdded?: OnTrackAddedCallback,
        onPeerConnected?: OnPeerConnectedCallback,
        onNewIceRemoteAddress?: OnNewIceRemoteAddressCallback,
        onClose?: OnCloseCallback,
        onStatusChange?: OnStatusChangeCallback
    ) {
        this.id = sessionId
        this.consumerId = consumerId
        this.stream = stream
        this.onTrackAdded = onTrackAdded
        this.onPeerConnected = onPeerConnected
        this.onNewIceRemoteAddress = onNewIceRemoteAddress
        this.onClose = onClose
        this.onStatusChange = onStatusChange
        this.status = ''
        this.signaller = signaller
        this.rtcConfiguration = rtcConfiguration
        this.ended = false
        this.availableICEIPs = []
        this.selectedICEIPs = selectedICEIPs
        this.selectedICEProtocols = selectedICEProtocols

        this.peerConnection = this.createRTCPeerConnection(rtcConfiguration)
        this.updateStatus('[WebRTC] [Session] Creating Session...')
    }

    public hasEnded(): boolean {
        return this.ended
    }

    public isConnected(): boolean {
        return this.peerConnection.connectionState === 'connected'
    }

    public updateStatus(status: string): void {
        this.status = status
        this.onStatusChange?.(status)
    }

    /**
     * Creates and configures WebRTC engine
     * @param {RTCConfiguration} configuration - configuration for the RTC connection
     * @returns {RTCPeerConnection} - instance of the RTC Peer Connection
     */
    private createRTCPeerConnection(configuration: RTCConfiguration): RTCPeerConnection {
        console.debug('[WebRTC] [Session] Creating RTCPeerConnection')
        const peerConnection = new RTCPeerConnection(configuration)

        // add video transceiver
        peerConnection.addTransceiver('video', {
            direction: 'recvonly'
        })
        this.ended = false

        // attatch event listeners
        peerConnection.addEventListener('negotiationneeded', this.boundOnNegotiationNeeded)
        peerConnection.addEventListener('track', this.boundOnTrack)
        peerConnection.addEventListener('icecandidate', this.boundOnIceCandidate)
        peerConnection.addEventListener('icecandidateerror', this.boundOnIceCandidateError)
        peerConnection.addEventListener('iceconnectionstatechange', this.boundOnIceConnectionStateChange)
        peerConnection.addEventListener('connectionstatechange', this.boundOnConnectionStateChange)
        peerConnection.addEventListener('signalingstatechange', this.boundOnSignalingStateChange)
        peerConnection.addEventListener('icegatheringstatechange', this.boundOnIceGatheringStateChange)

        return peerConnection
    }

    /**
     * when receiving video packets doesn't arrive perfectly spaced, so it adjusts playback delay behaviour on the receiver side
     * @param jitterBufferTarget 
     */
    public setJitterBufferTarget(jitterBufferTarget: number): void {
        // clams buffer value between 0-4000ms
        // higher buffer: more stable video, more latency. lower buffer: less latency, more risks or frame drops 
        const clamped = Math.min(4000, Math.max(0, jitterBufferTarget))
        // converts to seconds
        const playoutDelayHint = clamped > 0 ? clamped / 1000 : undefined
        this.peerConnection.getReceivers().forEach((receiver: RTCRtpReceiver) => {
            if (receiver.track.kind !== 'video') {
                return
            }

            console.debug(
                `[WebRTC] [Session]
                RTCRtpReceiver jitterBufferTarget attribute set from 
                ${(receiver as any).jitterBufferTarget} to ${clamped}`
            );
            (receiver as any).jitterBufferTarget = clamped

            console.debug(
                `[WebRTC] [Session]
                RTCRtpReceiver playoutDelayHint attribute set from ${
                    (receiver as any).playoutDelayHint
                } to ${playoutDelayHint}`
            );
            (receiver as any).playoutDelayHint = playoutDelayHint
        })

    }

    /**
     * sets remote offer, create answer and proceeds
     * @param description 
     */
    public onIncomingSDP(description: RTCSessionDescriptionInit): void {
        this.peerConnection
            .setRemoteDescription(new RTCSessionDescription(description))
            .then(() => {
                console.debug(`[WebRTC] [Session] Remote description set to ${JSON.stringify(description, null, 4)}`)
                this.onRemoteDescriptionSet()
            })
            .catch((reason) => {
                console.error(`[WebRTC] [Session] Failed setting remote description ${description}. Reason: ${reason}`)
            })
    }

    /**
     * defines the behavior for when a remote SDP is set to its RTCPeerConnection
     */
    private onRemoteDescriptionSet(): void {
        this.peerConnection
            .createAnswer()
            .then((description: RTCSessionDescriptionInit) => {
                console.debug(`[WebRTC] [Session] SDP Answer created as ${JSON.stringify(description, null, 4)}`)
                this.onAnswerCreated(description)
            })
            .catch((reason) => {
                console.error(`[WebRTC] [Session] Failed creating description answer. Reason: ${reason}`)
            })
    }

    /**
     * defines behavior for when a local SDP is created by its connection
     * @param {RTCSessionDescriptionInit} description 
     */
    private onAnswerCreated(description: RTCSessionDescriptionInit): void {
        this.peerConnection
            .setLocalDescription(description)
            .then(() => {
                console.debug(`[WebRTC] [Session] Local description set as ${JSON.stringify(description, null, 4)}`)
                this.onLocalDescriptionSet()
            })
            .catch(function (reason) {
                console.error(`[WebRTC] [Session] Failed setting local description. Reason ${reason}`)
            })
    }

    /**
     * defines the behavior for when a local SDP is set to its connection
     * @returns 
     */
    private onLocalDescriptionSet(): void {
        if (this.peerConnection.localDescription === null) {
            return
        }

        this.signaller.sendMediaNegotiation(this.id, this.consumerId, this.stream.id, this.peerConnection.localDescription)
    }

    /**
     * defines the behavior for when it receives a new ICE candidate from the signalling server
     * @param {RTCIceCandidateInit} candidate - The ICE candidate received
     * @returns 
     */
    public onIncomingICE(candidate: RTCIceCandidateInit): void {
        // extracts ipv4
        const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
        const extractIPv4 = (cand: string): string | undefined => {
            const matches = cand.match(ipv4Regex)
            return matches?.find((ip) => !ip.includes(':'))
        }

        if (!candidate.candidate) {
            console.debug('[WebRTC] [Session] Ignoring empty ICE candidate')
            return
        }

        const ipAddress = extractIPv4(candidate.candidate!)
        if (ipAddress && !this.availableICEIPs.includes(ipAddress) && this.onNewIceRemoteAddress) {
            this.availableICEIPs.push(ipAddress)
            this.onNewIceRemoteAddress(this.availableICEIPs)
        }

        if (
            Array.isArray(this.selectedICEIPs) &&
            this.selectedICEIPs.length > 0 &&
            !this.selectedICEIPs.some((address) => candidate.candidate!.includes(address))
        ) {
            this.onStatusChange?.(`Ignoring ICE candidate ${candidate.candidate} by IP filter`)
            console.debug(`[WebRTC] [Session] ICE candidate ignored by IP filter: ${JSON.stringify(candidate, null, 4)}`)
            return
        }

        if (
            Array.isArray(this.selectedICEProtocols) &&
            this.selectedICEProtocols.length > 0 &&
            !this.selectedICEProtocols.some((protocol) => candidate.candidate!.toLowerCase().includes(protocol))
        ) {
            this.onStatusChange?.(`Ignoring ICE candidate ${candidate.candidate} by protocol filter`)
            console.debug(
                `[WebRTC] [Session] ICE candidate ignored by protocol filter ${JSON.stringify(candidate, null, 4)}`
            )
            return
        }

        this.peerConnection
            .addIceCandidate(candidate)
            .then(() => {
                const msg = `ICE candidate added`
                console.debug(`[WebRTC] [Session] ${msg} ${JSON.stringify(candidate, null,4)}`)
                this.onStatusChange?.(msg)
            })
            .catch((reason) => {
                console.error(`[WebRTC] [Session] Failed adding ICE candidate ${candidate}. Reason: ${reason}`)
                this.onStatusChange?.(`Failed adding ICE candidate ${candidate}. Reason: ${reason}`)
            })
    }

    
    /**
     * triggered when an ice candidate its found
     * @param event 
     * @returns 
     */
    private onIceCandidate(event: RTCPeerConnectionIceEvent): void {
        if (!event.candidate) {
            return
        }

        this.signaller.sendIceNegotiation(this.id, this.consumerId, this.stream.id, event.candidate)
    }

    /**
     * 
     * @param event 
     */
    private onIceCandidateError(event: Event): void {
        const ev = event as RTCPeerConnectionIceErrorEvent
        const msg = `ICE Candidate ${ev.url} negotiation failed`
        console.debug(`[WebRTC] [Session] ${msg}`)
        this.onStatusChange?.(msg)
    }

    private onTrackAddedCallback(event: RTCTrackEvent): void {
        this.onTrackAdded?.(event)
    }

    private onNegotiationNeeded(_event: Event): void {
        const msg = '[WebRTC] [Session] Peer Connection is waiting for negotiation...'
        console.debug(msg)
    }

    private onIceConnectionStateChange(): void {
        const msg = `ICEConnection state changed to ${this.peerConnection.iceConnectionState}`
        console.debug('[WebRTC] [Session]' + msg)
        this.onStatusChange?.(msg)

        if (this.peerConnection.iceConnectionState === 'failed') {
            this.peerConnection.restartIce()
        }
    }

    private onConnectionStateChange(): void {
        const msg = `RTCPeerConnection state changed to ${this.peerConnection.connectionState}`
        console.debug('[WebRTC] [Session] ' + msg)
        this.onStatusChange?.(msg)

        if (this.peerConnection.connectionState === 'connected') {
            this.onPeerConnected?.()
        }

        if (this.peerConnection.connectionState === 'failed') {
            this.onClose?.(this.id, 'PeerConnection failed')
            this.end()
        }
    }

    private onSignalingStateChange(): void {
        const msg = `Signalling state changed to ${this.peerConnection.iceConnectionState}`
        console.debug('[WebRTC] [Session] ' + msg)
    }

    private onIceGatheringStateChange(): void {
        if (this.peerConnection.iceGatheringState === 'complete') {
            const msg = `ICE gathering completed for session ${this.id}`
            console.debug('[WebRTC] [Session] ' + msg)
            this.onStatusChange?.(msg)
        }
    }

    public end(): void {
        this.endPeerConnection()
        this.signaller.unregisterSession(this.id)
        this.peerConnection.close()

        this.onTrackAdded = undefined
        this.onNewIceRemoteAddress = undefined
        this.onClose = undefined

        this.ended = true
        console.debug (`[WebRTC] [Session] Session ${this.id} ended`)
    }

    private endPeerConnection(): void {
        this.peerConnection.removeEventListener('negotiationneeded', this.boundOnNegotiationNeeded)
        this.peerConnection.removeEventListener('track', this.boundOnTrack)
        this.peerConnection.removeEventListener('icecandidate', this.boundOnIceCandidate)
        this.peerConnection.removeEventListener('icecandidateerror', this.boundOnIceCandidateError)
        this.peerConnection.removeEventListener('iceconnectionstatechange', this.boundOnIceConnectionStateChange)
        this.peerConnection.removeEventListener('connectionstatechange', this.boundOnConnectionStateChange)
        this.peerConnection.removeEventListener('signalingstatechange', this.boundOnSignalingStateChange)
        this.peerConnection.removeEventListener('icegatheringstatechange', this.boundOnIceGatheringStateChange)

    }
}