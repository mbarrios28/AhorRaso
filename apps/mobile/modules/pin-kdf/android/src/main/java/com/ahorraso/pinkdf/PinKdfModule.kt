package com.ahorraso.pinkdf

import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PinKdfModule : Module() {
  companion object {
    @Volatile
    private var lastInteractionAt = SystemClock.elapsedRealtime()

    @JvmStatic
    fun recordUserInteraction() {
      lastInteractionAt = SystemClock.elapsedRealtime()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AhorRasoPinKdf")

    Function("interactionAgeMs") {
      (SystemClock.elapsedRealtime() - lastInteractionAt).toDouble()
    }

    AsyncFunction("deriveVerifier") { pin: String, secret: String, saltHex: String ->
      Pbkdf2HmacSha256.deriveVerifier(pin, secret, saltHex)
    }

    AsyncFunction("derivePasswordVerifier") { password: String, secret: String, saltHex: String ->
      require(password.length in 12..128 && password.all { it in ' '..'~' })
      Pbkdf2HmacSha256.deriveCredentialVerifier(password, secret, saltHex)
    }
  }
}
