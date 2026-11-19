package com.ahorraso.pinkdf

import org.junit.Assert.assertEquals
import org.junit.Test

class Pbkdf2HmacSha256Test {
  @Test
  fun matchesTheExistingNobleVerifierFormat() {
    val secret = "0123456789abcdef".repeat(4)
    val salt = "000102030405060708090a0b0c0d0e0f"

    assertEquals(
      "fae24b9d5945f38cce4835448bf1ff4561953cb542ee28374b61d55dd6753e9e",
      Pbkdf2HmacSha256.deriveVerifier("123456", secret, salt)
    )
  }

  @Test(expected = IllegalArgumentException::class)
  fun rejectsInvalidPinInput() {
    Pbkdf2HmacSha256.deriveVerifier(
      "12345",
      "0123456789abcdef".repeat(4),
      "000102030405060708090a0b0c0d0e0f"
    )
  }

  @Test(expected = IllegalArgumentException::class)
  fun rejectsInvalidSaltInput() {
    Pbkdf2HmacSha256.deriveVerifier(
      "123456",
      "0123456789abcdef".repeat(4),
      "bad"
    )
  }
}
