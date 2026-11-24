export class CredentialKdfUnavailableError extends Error {
  constructor() {
    super('Native credential verification is unavailable');
  }
}
