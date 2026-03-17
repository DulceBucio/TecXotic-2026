import { vehicleController } from "../controllers/vehicleController"

export function startGamepadPolling() {

  function poll() {

    const gp = navigator.getGamepads()[0]

    if (!gp) {
      console.log('[Commands] No controller')
      requestAnimationFrame(poll)
      return
    }

    vehicleController.driveDefault({
      pitch: gp.axes[1] * 1000,
      roll: gp.axes[0] * 1000,
      yaw: gp.axes[2] * 1000,
      throttle: gp.axes[3] * 1000,
      buttons: gp.buttons[0]?.pressed ? 1 : 0
    })

    requestAnimationFrame(poll)
  }

  poll()
}