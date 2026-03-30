import { vehicleController } from "../controllers/vehicleController"

const DEADZONE = 0.08

function applyDeadzone(value: number) {
  return Math.abs(value) < DEADZONE ? 0 : value
}

function scale(value: number) {
  return Math.round(value * 1000)
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

    let buttonA = gp.buttons[0]
    let buttonB = gp.buttons[1]
    let buttonX = gp.buttons[2]
    let buttonY = gp.buttons[3]

    let buttonLB = gp.buttons[4]
    let buttonRB = gp.buttons[5]

    let buttonLT = gp.buttons[6]
    let buttonRT = gp.buttons[7]

    let buttonBack = gp.buttons[8]
    let buttonStart = gp.buttons[9]

    // joysticks
    const leftX  = applyDeadzone(gp.axes[0]) // lateral
    const leftY  = applyDeadzone(gp.axes[1]) // forward
    const rightX = applyDeadzone(gp.axes[2]) // yaw
    const rightY = applyDeadzone(gp.axes[3]) // vertical

    const pitch = scale(-leftY)      // forward/back
    const roll = scale(leftX)        // lateral
    const yaw = scale(rightX)        // rotation
    const throttle = scale(-rightY)  // ascend/descend

    vehicleController.driveDefault({
      pitch,
      roll,
      yaw,
      throttle,
      buttons: 0
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

    console.log(`Commands: pitch: ${pitch}, roll: ${roll}, yaw: ${yaw}, throttle: ${throttle}`)
    requestAnimationFrame(poll)
  }

  poll()
}