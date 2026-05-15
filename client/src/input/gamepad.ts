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

let prevButtons: boolean[] = []

export function startGamepadPolling() {
  function poll() {

    const gp = navigator.getGamepads()[0]
    

    if (!gp) {
      console.log('[Commands] No controller')
      requestAnimationFrame(poll)
      return
    }

    // ROCK
    // let buttonA = gp.buttons[0]
    // let buttonB = gp.buttons[1]
    // let buttonX = gp.buttons[2]
    // let buttonY = gp.buttons[3]

    // let buttonLB = gp.buttons[4]
    // let buttonRB = gp.buttons[5]

    // let buttonBack = gp.buttons[8]
    // let buttonStart = gp.buttons[9]

    // // joysticks
    // const leftX  = applyDeadzone(gp.axes[0]) // lateral
    // const leftY  = applyDeadzone(gp.axes[1]) // forward
    // const rightX = applyDeadzone(gp.axes[2]) // yaw
    // const rightY = applyDeadzone(gp.axes[3]) // vertical

    // // triggers
    // let buttonLT = gp.buttons[6].value
    // let buttonRT = gp.buttons[7].value

    // const lt = applyDeadzone(buttonLT)
    // const rt = applyDeadzone(buttonRT)

    // const triggerForward = (lt + rt) / 2 
    // const triggerYawDelta = lt - rt

    // const pitch = scale(clamp(-leftY + triggerForward, -1, 1))      // forward/back
    // const roll = scale(leftX)        // lateral
    // const yaw = scale(clamp(rightX + triggerYawDelta, -1, 1))        // rotation
    // const throttle = Math.round(-rightY * 500) + 500    // ascend/descend

    let buttonUp = gp.buttons[12]
    let buttonDown = gp.buttons[13]
    let buttonLeft = gp.buttons[14]
    let buttonRight = gp.buttons[15]
    
    // ROKI
    const buttonLB    = gp.buttons[4]
    const buttonRB    = gp.buttons[5]

    const rightX = applyDeadzone(gp.axes[2])
    const leftY = applyDeadzone(gp.axes[1])

    const lt = applyDeadzone(gp.buttons[6].value)
    const rt = applyDeadzone(gp.buttons[7].value)
    const throttleInput = rt - lt

    let yawInput = 0
    if (buttonRB.pressed) yawInput += 1
    if (buttonLB.pressed) yawInput -= 1

    const pitch    = scale(-leftY)
    const roll     = scale(rightX)
    const yaw      = scale(clamp(yawInput, -1, 1))
    const throttle = Math.round(throttleInput * 500) + 500

    // roki 

    let clawButtons = 0

    if (buttonUp.pressed && !buttonDown.pressed) {
      clawButtons = 1  // open
    } else if (buttonDown.pressed && !buttonUp.pressed) {
      clawButtons = 2  // close
    } else if (buttonLeft.pressed && !buttonRight.pressed) {
      clawButtons = 3
    } else if (buttonRight.pressed && !buttonLeft.pressed) {
      clawButtons = 4
    } else {
      clawButtons = 0  // stop
    }

    vehicleController.driveDefault({
      pitch,
      roll,
      yaw,
      throttle,
      buttons: clawButtons
    })

    gp.buttons.forEach((btn, i) => {
      const pressed = btn.pressed
      const wasPressed = prevButtons[i] || false
      
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

          case 0: // A → manual
            vehicleController.setMode("MANUAL")
            console.log('[Commands] Manual mode invoked')
            break
            
          case 1: // B → stabilize
            vehicleController.setMode("STABILIZE")
            console.log('[Commands] Stabilize mode invoked')
            break
            
          case 2: // X 
            break
  
          case 3: // Y 
            // optional
            break
          
          case 4: // LB 
            // implement later
            break

          case 5: // RB
            // implement later
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
