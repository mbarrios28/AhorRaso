package com.ahorraso.pinkdf

import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

internal object Pbkdf2HmacSha256 {
  private const val ITERATIONS = 600_000
  private const val OUTPUT_BITS = 256
  private const val SECRET_HEX_LENGTH = 64
  private const val SALT_BYTES = 16
  private const val HEX_DIGITS = "0123456789abcdef"

  fun deriveVerifier(pin: String, secret: String, saltHex: String): String {
    require(pin.length == 6 && pin.all { it in '0'..'9' }) {
      "PIN must contain six digits"
    }
    return deriveCredentialVerifier(pin, secret, saltHex)
  }

  fun deriveCredentialVerifier(credential: String, secret: String, saltHex: String): String {
    require(secret.length == SECRET_HEX_LENGTH && secret.all(::isHexDigit)) {
      "Secret must be 32 bytes encoded as hexadecimal"
    }

    val salt = decodeHex(saltHex, SALT_BYTES)
    val password = CharArray(credential.length + secret.length)
    credential.toCharArray(password, destinationOffset = 0)
    secret.toCharArray(password, destinationOffset = credential.length)
    val keySpec = PBEKeySpec(password, salt, ITERATIONS, OUTPUT_BITS)

    try {
      val derivedKey = SecretKeyFactory
        .getInstance("PBKDF2WithHmacSHA256")
        .generateSecret(keySpec)
        .encoded
      return try {
        encodeHex(derivedKey)
      } finally {
        derivedKey.fill(0)
      }
    } finally {
      keySpec.clearPassword()
      password.fill('\u0000')
      salt.fill(0)
    }
  }

  private fun decodeHex(value: String, byteCount: Int): ByteArray {
    require(value.length == byteCount * 2 && value.all(::isHexDigit)) {
      "Salt must be 16 bytes encoded as hexadecimal"
    }
    return ByteArray(byteCount) { index ->
      val high = HEX_DIGITS.indexOf(value[index * 2].lowercaseChar())
      val low = HEX_DIGITS.indexOf(value[index * 2 + 1].lowercaseChar())
      ((high shl 4) or low).toByte()
    }
  }

  private fun encodeHex(value: ByteArray): String = buildString(value.size * 2) {
    for (byte in value) {
      val unsigned = byte.toInt() and 0xff
      append(HEX_DIGITS[unsigned ushr 4])
      append(HEX_DIGITS[unsigned and 0x0f])
    }
  }

  private fun isHexDigit(value: Char): Boolean =
    value in '0'..'9' || value.lowercaseChar() in 'a'..'f'
}
