import { type CameraStream } from "./CameraStream"

export type Message = 
    | {
        type: 'question'
        content: Question
    }
    | {
        type: 'answer'
        content: Answer
    }
    | {
        type: 'negotiation'
        content: Negotiation
    }

export type Answer = 
    | {
        type: 'peerId'
        content: PeerIdAnswer
    }
    | {
        type: 'availableStreams',
        content: Array<CameraStream>
    }
    | {
        type: 'startSession',
        content: BindAnswer
    }

export type Question = 
    | {
        type: 'peerId'
    }
    | {
        type: 'availableStreams'
    }
    | {
        type: 'startSession'
        content: BindOffer
    }
    | {
        type: 'endSession'
        content: EndSessionQuestion
    }

export type Negotiation = 
    | {
        type: 'mediaNegotiation'
        content: MediaNegotiation
    }
    | {
        type: 'iceNegotiation'
        content: IceNegotiation
    }

export interface BindOffer {
    consumer_id: string
    producer_id: string
}

export interface BindAnswer {
    consumer_id: string
    producer_id: string
    session_id: string
}

export interface PeerIdAnswer {
    id: string
}

export interface IceNegotiation {
    consumer_id: string
    producer_id: string
    session_id: string
    ice: RTCIceCandidateInit
}

export interface MediaNegotiation {
    consumer_id: string
    producer_id: string
    session_id: string
    sdp: RTCSessionDescriptionInit
}

export interface EndSessionQuestion {
    consumer_id: string
    producer_id: string
    session_id: string
    reason: string
}