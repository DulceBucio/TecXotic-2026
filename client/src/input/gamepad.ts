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
    return gp.buttons[index] ?? { pressed: false, touched: false, value: 0 }
}

function axis(gp: Gamepad, index: number): number {
    return gp.axes[index] ?? 0
}

let prevButtons: boolean[] = []

export function startGamepadPolling() {
    function poll() {
        const gp = navigator.getGamepads()[0]

        if (!gp) {
            requestAnimationFrame(poll)
            return
        }

        const buttonUp    = btn(gp, 12)
        const buttonDown  = btn(gp, 13)
        const buttonLeft  = btn(gp, 14)
        const buttonRight = btn(gp, 15)

        const buttonLB = btn(gp, 4)
        const buttonRB = btn(gp, 5)

        const rightX       = applyDeadzone(axis(gp, 2))
        const leftY        = applyDeadzone(axis(gp, 1))
        const lt           = applyDeadzone(btn(gp, 6).value)
        const rt           = applyDeadzone(btn(gp, 7).value)
        const throttleInput = rt - lt

        let yawInput = 0
        if (buttonRB.pressed) yawInput += 1
        if (buttonLB.pressed) yawInput -= 1

        const pitch    = scale(-leftY)
        const roll     = scale(rightX)
        const yaw      = scale(clamp(yawInput, -1, 1))
        const throttle = Math.round(throttleInput * 500) + 500

        let clawButtons = 0
        if      (buttonUp.pressed    && !buttonDown.pressed)  clawButtons = 3
        else if (buttonDown.pressed  && !buttonUp.pressed)    clawButtons = 4
        else if (buttonLeft.pressed  && !buttonRight.pressed) clawButtons = 1
        else if (buttonRight.pressed && !buttonLeft.pressed)  clawButtons = 2

        vehicleController.driveDefault({ pitch, roll, yaw, throttle, buttons: clawButtons })

        gp.buttons.forEach((b, i) => {
            const pressed    = b?.pressed ?? false
            const wasPressed = prevButtons[i] ?? false

            if (pressed && !wasPressed) {
                switch (i) {
                    case 8: 
                      vehicleController.disarm(); 
                      console.log(`[Commands] Disarm invoked`)
                      break
                    case 9: 
                      vehicleController.arm(); 
                      console.log(`[Commands] Arm invoked`)
                      break
                    case 0: vehicleController.setMode('MANUAL'); break
                }
            }

            prevButtons[i] = pressed
        })

        console.log(`[Commands] pitch: ${pitch}, roll: ${roll}, yaw: ${yaw}, throttle: ${throttle}, buttons: ${clawButtons}`)
        requestAnimationFrame(poll)
    }

    poll()
}

// import { vehicleController } from "../controllers/vehicleController"

// const DEADZONE = 0.08

// function applyDeadzone(value: number) {
//   return Math.abs(value) < DEADZONE ? 0 : value
// }

// function scale(value: number) {
//   return Math.round(value * 1000)
// }

// function clamp(value: number, min: number, max: number) {
//   return Math.max(min, Math.min(max, value))
// }

// let prevButtons: boolean[] = []

// export function startGamepadPolling() {
//   function poll() {

//     const gp = navigator.getGamepads()[0]

//     if (!gp) {
//       console.log('[Commands] No controller')
//       requestAnimationFrame(poll)
//       return
//     }

//     const buttonLB    = gp.buttons[4]
//     const buttonRB    = gp.buttons[5]

//     const rightX = applyDeadzone(gp.axes[2])
//     const rightY = applyDeadzone(gp.axes[3])

//     const lt = applyDeadzone(gp.buttons[6].value)
//     const rt = applyDeadzone(gp.buttons[7].value)
//     const throttleInput = rt - lt

//     let yawInput = 0
//     if (buttonRB.pressed) yawInput += 1
//     if (buttonLB.pressed) yawInput -= 1

//     const pitch    = scale(-rightY)
//     const roll     = scale(rightX)
//     const yaw      = scale(clamp(yawInput, -1, 1))
//     const throttle = Math.round(throttleInput * 500) + 500

//     let clawButtons = 0

//     if (buttonUp.pressed && !buttonDown.pressed) {
//       clawButtons = 1  // open
//     } else if (buttonDown.pressed && !buttonUp.pressed) {
//       clawButtons = 2  // close
//     } else if (buttonLeft.pressed && !buttonRight.pressed) {
//       clawButtons = 3
//     } else if (buttonRight.pressed && !buttonLeft.pressed) {
//       clawButtons = 4
//     } else {
//       clawButtons = 0  // stop
//     }

//     vehicleController.driveDefault({
//       pitch,
//       roll,
//       yaw,
//       throttle,
//       buttons: clawButtons
//     })

//     vehicleController.driveDefault({
//       pitch,
//       roll,
//       yaw,
//       throttle,
//       buttons: 0
//     })

//     gp.buttons.forEach((btn, i) => {
//       const pressed    = btn.pressed
//       const wasPressed = prevButtons[i] || false

//       if (pressed && !wasPressed) {
//         switch (i) {
//           case 0: // A → ACRO
//             break

//           case 1: // B → STABILIZE
//             vehicleController.setMode("STABILIZE")
//             console.log('[Commands] Stabilize mode invoked')
//             break

//           case 3: // Y → MANUAL
//             vehicleController.setMode("MANUAL")
//             console.log('[Commands] Manual mode invoked')
//             break

//           case 8: // Back → disarm
//             vehicleController.disarm()
//             console.log('[Commands] Disarm invoked')
//             break

//           case 9: // Start → arm
//             vehicleController.arm()
//             console.log('[Commands] Arm invoked')
//             break

//           case 14: // Dpad left → left roll
//             break

//           case 15: // Dpad right → right roll
//             break
//         }
//       }

//       prevButtons[i] = pressed
//     })

//     console.log(`[Commands] pitch: ${pitch}, roll: ${roll}, yaw: ${yaw}, throttle: ${throttle}`)
//     requestAnimationFrame(poll)
//   }

//   poll()
// }
