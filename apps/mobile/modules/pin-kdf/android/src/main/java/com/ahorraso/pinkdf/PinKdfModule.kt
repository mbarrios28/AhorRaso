package com.ahorraso.pinkdf

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PinKdfModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AhorRasoPinKdf")

    AsyncFunction("deriveVerifier") { pin: String, secret: String, saltHex: String ->
      Pbkdf2HmacSha256.deriveVerifier(pin, secret, saltHex)
    }
  }
}
