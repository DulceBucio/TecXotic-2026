import { vehicleController } from "../controllers/vehicleController"

const DEADZONE = 0.08

function applyDeadzone(value: number) {
    return Math.abs(value) < DEADZONE ? 0 : value
}

function scale(value: number) {
    return Math.round(value * 1000)
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
}

function btn(gp: Gamepad, index: number): GamepadButton {
    const button = gp.buttons[index] ?? { pressed: false, touched: false, value: 0 }
    if (button.pressed) console.log(`[Gamepad] btn(${index}) pressed, value: ${button.value}`)
    return button
}

function axis(gp: Gamepad, index: number): number {
    return gp.axes[index] ?? 0
}

let prevButtons: boolean[] = []

export function startGamepadPolling() {
    function poll() {
        const gp = navigator.getGamepads()[0]

        if (!gp) {
            console.log('[Commands] No controller')
            requestAnimationFrame(poll)
            return
        }

        // temporary — remove after confirming all indices
        gp.axes.forEach((value, i) => {
            if (Math.abs(value) > 0.1) console.log(`[Gamepad] RAW axis ${i}: ${value}`)
        })
        gp.buttons.forEach((b, i) => {
            if (b?.pressed) console.log(`[Gamepad] RAW button ${i} pressed`)
        })

        const buttonLB = btn(gp, 4)
        const buttonRB = btn(gp, 5)

        const rightX        = applyDeadzone(axis(gp, 2))
        const leftY         = applyDeadzone(axis(gp, 1))
        const lt            = applyDeadzone(btn(gp, 6).value)
        const rt            = applyDeadzone(btn(gp, 7).value)
        const throttleInput = rt - lt

        let yawInput = 0
        if (buttonRB.pressed) yawInput += 1
        if (buttonLB.pressed) yawInput -= 1

        const pitch    = scale(-leftY)
        const roll     = scale(rightX)
        const yaw      = scale(clamp(yawInput, -1, 1))
        const throttle = Math.round(throttleInput * 500) + 500

        // D-pad as axes — adjust indices after checking logs
        const dpadX = axis(gp, 6)
        const dpadY = axis(gp, 7)

        let clawButtons = 0
        if      (dpadY < -0.5) clawButtons = 3  // up
        else if (dpadY >  0.5) clawButtons = 4  // down
        else if (dpadX < -0.5) clawButtons = 1  // left
        else if (dpadX >  0.5) clawButtons = 2  // right

        vehicleController.driveDefault({ pitch, roll, yaw, throttle, buttons: clawButtons })

        gp.buttons.forEach((b, i) => {
            const pressed    = b?.pressed ?? false
            const wasPressed = prevButtons[i] ?? false

            if (pressed && !wasPressed) {
                switch (i) {
                    case 8:
                        vehicleController.disarm()
                        console.log('[Commands] Disarm invoked')
                        break
                    case 9:
                        vehicleController.arm()
                        console.log('[Commands] Arm invoked')
                        break
                    case 0:
                        vehicleController.setMode('MANUAL')
                        console.log('[Commands] Manual mode invoked')
                        break
                }
            }

            prevButtons[i] = pressed
        })

        console.log(`[Commands] pitch: ${pitch}, roll: ${roll}, yaw: ${yaw}, throttle: ${throttle}, buttons: ${clawButtons}`)
        requestAnimationFrame(poll)
    }

    poll()
}